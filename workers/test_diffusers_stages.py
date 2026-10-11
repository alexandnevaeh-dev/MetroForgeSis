import io
import unittest
from contextlib import ExitStack
from types import SimpleNamespace
from unittest.mock import patch
import diffusers_image_worker as worker

class StageTests(unittest.TestCase):
    def test_health_reports_runtime_loading_before_a_failed_import(self):
        with patch.dict(worker.sys.modules, {'torch': None}), patch.object(worker, '_worker_stage') as stage:
            result = worker.health_check({})
        self.assertFalse(result['ok'])
        stage.assert_called_once_with('health_runtime_loading')

    def test_quick_discovery_does_not_import_the_runtime(self):
        with patch('importlib.util.find_spec', return_value=object()), patch.object(worker, '_worker_stage') as stage:
            result = worker.health_check({'quick': True})
        self.assertTrue(result['ok'])
        stage.assert_not_called()

    def test_prompt_reports_loading_before_a_failed_tokenizer_import(self):
        with patch.dict(worker.sys.modules, {'transformers': None}), patch.object(worker, '_worker_stage') as stage:
            with self.assertRaises(ModuleNotFoundError):
                worker.check_prompt({'prompt': 'actor'})
        stage.assert_called_once_with('prompt_tokenizer_loading')
    def test_callback_preserves_tensor_dictionary_and_reports_only_final_step(self):
        pipe=SimpleNamespace(scheduler=SimpleNamespace(timesteps=[3,2,1]),_execution_device='cpu')
        values={'latents':object()}
        with patch.object(worker,'_worker_stage') as stage:
            for step in range(3):
                self.assertIs(worker._denoising_stage(pipe,step,3-step,values),values)
            stage.assert_called_once_with('denoising_complete',None)
        self.assertEqual(list(values),['latents'])
    def test_stage_contains_only_label_and_numeric_time_without_model_context(self):
        output=io.StringIO()
        with patch.object(worker.sys,'stderr',output),patch.dict(worker.os.environ,{'METROFORGE_DIFFUSERS_STAGE_LOG':''}):
            worker._worker_stage('encoding')
        self.assertIn('METROFORGE_WORKER_STAGE',output.getvalue())
        self.assertNotIn('model_path',output.getvalue())
        self.assertNotIn('prompt',output.getvalue())

    def test_img2img_completion_uses_actual_sliced_loop_length(self):
        pipe = SimpleNamespace(num_timesteps=2, scheduler=SimpleNamespace(timesteps=[4, 3, 2, 1]), _execution_device='cpu')
        values = {'latents': object()}
        with patch.object(worker, '_worker_stage') as stage:
            self.assertIs(worker._denoising_stage(pipe, 0, 2, values), values)
            stage.assert_not_called()
            self.assertIs(worker._denoising_stage(pipe, 1, 1, values), values)
            stage.assert_called_once_with('denoising_complete', None)

    def test_older_pipeline_receives_no_unsupported_callback(self):
        class OlderPipeline:
            def __call__(self, prompt, **kwargs):
                pass
        options = {'guidance_scale': 3.5}
        self.assertIs(worker._stage_generation_options(OlderPipeline(), options), options)
        self.assertEqual(options, {'guidance_scale': 3.5})

    def _generate_fixture(self, mode, *, load_error=None, prompt_error=None):
        class Pipeline:
            scheduler = SimpleNamespace(timesteps=list(range(20)))
            _execution_device = 'cpu'
            guidance_scale = 3.5
            options = None
            adapter_scale = None

            def set_ip_adapter_scale(self, value):
                self.adapter_scale = value

            def __call__(self, callback_on_step_end=None, **kwargs):
                self.options = kwargs
                self.num_timesteps = 2 if mode == 'img2img' else 3
                values = {'latents': object()}
                for step in range(self.num_timesteps):
                    if callback_on_step_end:
                        assert callback_on_step_end(self, step, self.num_timesteps - step, values) is values
                image = SimpleNamespace(width=64, height=64, save=lambda buf, format: buf.write(b'test-image'))
                return SimpleNamespace(images=[image])

        pipe = Pipeline()
        fake_torch = SimpleNamespace(Generator=lambda **kwargs: SimpleNamespace(manual_seed=lambda seed: 'seeded-generator'))
        req = {'model_id': 'test-model', 'prompt': 'actor', 'negative_prompt': 'blur', 'steps': 12,
               'width': 64, 'height': 64, 'seed': 42, 'conditioning_mode': mode, 'conditioning_strength': 0.7}
        stages = []
        with ExitStack() as stack:
            stack.enter_context(patch.dict(worker.sys.modules, {'torch': fake_torch}))
            for name, value in [('_resolve_backend', 'cpu'), ('_torch_dtype', 'float32'), ('_local_style_adapter', None),
                                ('_prepare_init_image', object() if mode else None), ('_canny_control_image', 'control-image'),
                                ('_ensure_model_available', {'model_path': 'test-model'}), ('check_prompt', {'anyOverflow': False}),
                                ('_attention_processors', []), ('_offload_strategy', 'none')]:
                stack.enter_context(patch.object(worker, name, return_value=value))
            for name in ['get_img2img_pipeline', 'get_controlnet_pipeline', 'get_ip_adapter_pipeline', 'get_pipeline']:
                stack.enter_context(patch.object(worker, name, return_value=pipe, side_effect=load_error))
            stack.enter_context(patch.object(worker, '_assert_prompt_budget', side_effect=prompt_error))
            stack.enter_context(patch.object(worker, '_worker_stage', side_effect=lambda phase, *args: stages.append(phase)))
            result = None
            error = None
            try:
                result = worker.generate_image(req)
            except Exception as exc:
                error = exc
        return result, pipe, stages, error

    def test_all_conditioning_routes_report_stages_and_preserve_sampling(self):
        for mode in ['img2img', 'controlnet_canny', 'ip_adapter', None]:
            with self.subTest(mode=mode):
                result, pipe, stages, error = self._generate_fixture(mode)
                self.assertIsNone(error)
                self.assertTrue(result['ok'])
                self.assertEqual(result['effectiveConditioningMode'], mode)
                expected = ['pipeline_loading', 'pipeline_ready', 'prompt_validated', 'denoising',
                            'denoising_complete', 'pipeline_returned', 'encoding', 'encoded']
                # Text-to-image preflights tokens before loading; conditioned routes validate the loaded tokenizer.
                if mode is None:
                    expected.remove('prompt_validated')
                    self.assertLess(stages.index('prompt_validated'), stages.index('pipeline_loading'))
                self.assertEqual([phase for phase in stages if phase in expected], expected)
                self.assertEqual(pipe.options['prompt'], 'actor')
                self.assertEqual(pipe.options['negative_prompt'], 'blur')
                self.assertEqual(pipe.options['width'], 64)
                self.assertEqual(pipe.options['height'], 64)
                self.assertEqual(pipe.options['num_inference_steps'], 20 if mode in ['controlnet_canny', 'ip_adapter'] else 12)
                self.assertEqual(pipe.options['generator'], 'seeded-generator')
                if mode == 'img2img':
                    self.assertEqual(pipe.options['strength'], 0.7)
                if mode == 'controlnet_canny':
                    self.assertEqual(pipe.options['controlnet_conditioning_scale'], 0.7)
                    self.assertEqual(pipe.options['image'], 'control-image')
                if mode == 'ip_adapter':
                    self.assertEqual(pipe.adapter_scale, 0.7)
                    self.assertIn('ip_adapter_image', pipe.options)

    def test_loading_failure_never_reports_inference_or_completion(self):
        for mode in ['img2img', 'controlnet_canny', 'ip_adapter']:
            with self.subTest(mode=mode):
                result, pipe, stages, error = self._generate_fixture(mode, load_error=RuntimeError('load failed'))
                self.assertIsNone(result)
                self.assertIsInstance(error, RuntimeError)
                self.assertEqual(stages[-1], 'pipeline_loading')
                self.assertIsNone(pipe.options)

    def test_invalid_prompt_never_starts_conditioned_inference(self):
        for mode in ['img2img', 'controlnet_canny', 'ip_adapter']:
            with self.subTest(mode=mode):
                result, pipe, stages, error = self._generate_fixture(mode, prompt_error=ValueError('token budget'))
                self.assertIsNone(result)
                self.assertIsInstance(error, ValueError)
                self.assertEqual(stages[-1], 'pipeline_ready')
                self.assertIsNone(pipe.options)

if __name__=='__main__':unittest.main()

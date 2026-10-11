import io
import unittest
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

if __name__=='__main__':unittest.main()

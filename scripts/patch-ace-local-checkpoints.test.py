import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('ace_patch', Path(__file__).with_name('patch-ace-local-checkpoints.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class CheckpointPatchContract(unittest.TestCase):
    def test_exact_preimage_and_idempotency(self):
        for before, after in module.CHANGES.values():
            original = 'prefix\n' + before + '\nsuffix\n'
            result, changed = module.plan_text(original, before, after)
            self.assertTrue(changed)
            self.assertEqual(result, 'prefix\n' + after + '\nsuffix\n')
            self.assertEqual(module.plan_text(result, before, after), (result, False))

    def test_unexpected_or_ambiguous_vendor_source_fails_closed(self):
        for before, after in module.CHANGES.values():
            for original in ('unrecognized revision', before + '\n' + before, before + '\n' + after):
                with self.assertRaises(ValueError):
                    module.plan_text(original, before, after)

    def test_windows_source_preserves_line_endings_and_already_applied_bytes(self):
        for before, after in module.CHANGES.values():
            original = ('prefix\n' + before + '\nsuffix\n').replace('\n', '\r\n').encode()
            updated, changed = module.plan_bytes(original, before, after)
            self.assertTrue(changed)
            self.assertEqual(updated, ('prefix\n' + after + '\nsuffix\n').replace('\n', '\r\n').encode())
            self.assertEqual(module.plan_bytes(updated, before, after), (updated, False))


if __name__ == '__main__':
    unittest.main()

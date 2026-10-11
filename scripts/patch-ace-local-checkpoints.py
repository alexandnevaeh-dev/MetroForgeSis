"""Apply two reviewed fixes to the pinned, isolated ACE SDK; preserve vendor preimages."""
import argparse
from datetime import datetime, timezone
import difflib
import hashlib
import json
import os
from pathlib import Path
import uuid

CHANGES = {
    'acestep/api/startup_model_init.py': (
        'checkpoint_dir = os.path.join(project_root, "checkpoints")',
        'from acestep.model_downloader import get_checkpoints_dir\n    checkpoint_dir = str(get_checkpoints_dir())',
    ),
    'acestep/model_downloader.py': (
        '    for component in MAIN_MODEL_COMPONENTS:\n        component_path = checkpoints_dir / component',
        '    required_components = MAIN_MODEL_COMPONENTS\n    if os.environ.get("ACESTEP_INIT_LLM", "").strip().lower() == "false":\n        required_components = [name for name in required_components if not name.startswith("acestep-5Hz-lm-")]\n    for component in required_components:\n        component_path = checkpoints_dir / component',
    ),
}


def plan_text(text, before, after):
    if text.count(after) == 1 and before not in text:
        return text, False
    if text.count(before) != 1 or after in text:
        raise ValueError('Unexpected SDK source; inspect the installed version before patching')
    return text.replace(before, after), True


def plan_bytes(original, before, after):
    text = original.decode('utf-8')
    normalized = text.replace('\r\n', '\n')
    updated, changed = plan_text(normalized, before, after)
    if not changed:
        return original, False
    if '\r\n' in text:
        if '\n' in text.replace('\r\n', ''):
            raise ValueError('Mixed vendor line endings need manual review')
        updated = updated.replace('\n', '\r\n')
    return updated.encode('utf-8'), True


def patch_sdk(root, receipts):
    root, receipts = Path(root).resolve(), Path(receipts).resolve()
    if not root.is_absolute() or not receipts.is_absolute() or root.drive.lower() != 'e:' or receipts.drive.lower() != 'e:':
        raise ValueError('The isolated SDK and receipts must be on E:')
    if not (root / 'acestep/api_server.py').is_file():
        raise ValueError('Not an ACE-Step SDK root')
    plans = []
    for relative, (before, after) in CHANGES.items():
        path = root / relative
        if path.is_symlink() or path.resolve() != path:
            raise ValueError('Linked SDK source cannot be patched')
        original = path.read_bytes()
        updated, changed = plan_bytes(original, before, after)
        plans.append((relative, path, original, updated, changed))
    if not any(row[4] for row in plans):
        return {'status': 'already_applied', 'files': list(CHANGES)}
    receipt = receipts / (datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:8])
    receipt.mkdir(parents=True, exist_ok=False)
    for relative, _, original, _, _ in plans:
        backup = receipt / 'before' / relative
        backup.parent.mkdir(parents=True, exist_ok=True)
        backup.write_bytes(original)
    committed = []
    try:
        for relative, path, original, updated, changed in plans:
            if not changed:
                continue
            if path.read_bytes() != original:
                raise ValueError('SDK source changed during patch preparation')
            temporary = path.with_name(path.name + '.metroforge-' + uuid.uuid4().hex + '.tmp')
            try:
                temporary.write_bytes(updated)
                os.replace(temporary, path)
            finally:
                if temporary.exists():
                    temporary.unlink()
            committed.append((path, original))
    except Exception:
        for path, original in reversed(committed):
            path.write_bytes(original)
        raise
    diff = ''.join(''.join(difflib.unified_diff(original.decode('utf-8').splitlines(True), updated.decode('utf-8').splitlines(True), fromfile=relative, tofile=relative)) for relative, _, original, updated, changed in plans if changed)
    (receipt / 'reviewed.patch').write_text(diff, encoding='utf-8')
    result = {'status': 'applied', 'receipt': str(receipt), 'files': [{'path': relative, 'beforeSha256': hashlib.sha256(original).hexdigest(), 'afterSha256': hashlib.sha256(updated).hexdigest()} for relative, _, original, updated, _ in plans]}
    (receipt / 'receipt.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sdk-root', required=True)
    parser.add_argument('--receipt-root', required=True)
    options = parser.parse_args()
    print(json.dumps(patch_sdk(options.sdk_root, options.receipt_root)))

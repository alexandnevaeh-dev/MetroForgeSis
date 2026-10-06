"""Retain a stack trace when native provider discovery stalls; no model downloads."""
import faulthandler
import runpy
from pathlib import Path
faulthandler.enable()
faulthandler.dump_traceback_later(30, repeat=True)
import site
site.main()
runpy.run_path(str(Path(__file__).resolve().parents[1] / 'workers/diffusers_image_worker.py'), run_name='__main__')

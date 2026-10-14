"""Builds and renders one room inside Blender. Run through run.mjs:
  blender -b --factory-startup --python build.py -- <roomId> [--preview] [--samples=N]
"""
import importlib
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(HERE, 'lib'), os.path.join(HERE, 'rooms')]

import bpy  # noqa: E402

from core import Room  # noqa: E402
from export import camera, render  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
room_id = next(a for a in argv if not a.startswith('--'))
preview = '--preview' in argv
samples = int(next((a.split('=')[1] for a in argv if a.startswith('--samples=')), 24 if preview else 160))

bpy.ops.wm.read_factory_settings(use_empty=True)
mod = importlib.import_module(room_id.replace('-', '_'))
room = Room(room_id)
mod.build(room)
meta = mod.META
cam = meta['camera']
w, h = (800, 500) if preview else (1600, 1000)
camera(cam['pos'], cam['target'], cam['fov'], w, h, cam.get('shift', 0.0))
if '--blend' in argv:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, '..', '..', '.blender-out', f'{room_id}.blend'))
render(room, meta, os.path.join(HERE, '..', '..'), samples=samples, preview=preview,
       log=lambda m: print(f'[room] {m}', flush=True), reuse='--reuse' in argv)

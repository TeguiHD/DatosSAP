import sys
from pathlib import Path


IMPORTER_ROOT = Path(__file__).resolve().parents[1]
if str(IMPORTER_ROOT) not in sys.path:
    sys.path.insert(0, str(IMPORTER_ROOT))

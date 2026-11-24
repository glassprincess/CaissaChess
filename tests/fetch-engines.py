from pathlib import Path
import hashlib
import importlib.util
import io
import tarfile
import tempfile

spec = importlib.util.spec_from_file_location("fetch_engines", Path(__file__).resolve().parents[1] / "tools" / "fetch-engines.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

with tempfile.TemporaryDirectory(prefix="caissa-engine-test-") as folder:
    root = Path(folder)
    elf = b"\x7fELF\x02\x01" + bytes(12) + (183).to_bytes(2, "little") + b"payload"
    archive = root / "fixture.tar.gz"
    with tarfile.open(archive, "w:gz") as output:
        entry = tarfile.TarInfo("stockfish/stockfish-android-arm64")
        entry.size = len(elf)
        output.addfile(entry, io.BytesIO(elf))
    checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
    target = root / "jni" / "libstockfish.so"
    module.install_archive(archive, checksum, "arm64-v8a", target)
    assert target.read_bytes() == elf
    for digest, abi in [("0" * 64, "arm64-v8a"), (checksum, "armeabi-v7a")]:
        try:
            module.install_archive(archive, digest, abi, target)
            raise AssertionError("Invalid archive accepted")
        except ValueError:
            assert target.read_bytes() == elf
print("ok engine archive checksum, ABI validation, fixed extraction path, no overwrite on rejection")

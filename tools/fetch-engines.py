#!/usr/bin/env python3
"""Install the official Stockfish 19 Android executables as packaged JNI files."""
from pathlib import Path
import hashlib
import shutil
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
RELEASE = "https://github.com/official-stockfish/Stockfish/releases/download/sf_19/"
ARCHIVES = {
    "arm64-v8a": ("stockfish-android-arm64-universal.tar.gz", "ebb24051aa4a222b4daaf049b882ecf1163d370c128fe02316602643f4d5e426"),
    "armeabi-v7a": ("stockfish-android-armv7-neon.tar.gz", "47c34963f1cdf4a6af34c1b5294f7a4e2679b3eb52698c324855af2c6486024b"),
}

def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()

def install_archive(archive, expected_hash, abi, destination):
    if sha256(archive) != expected_hash:
        raise ValueError("Archive SHA-256 mismatch: " + archive.name)
    machine = 183 if abi == "arm64-v8a" else 40
    elf_class = 2 if abi == "arm64-v8a" else 1
    with tarfile.open(archive, "r:gz") as bundle:
        binary = None
        for member in sorted(bundle.getmembers(), key=lambda item: item.size, reverse=True):
            if not member.isfile():
                continue
            with bundle.extractfile(member) as stream:
                header = stream.read(20)
            if (len(header) == 20 and header[:4] == b"\x7fELF" and header[4] == elf_class
                    and header[5] == 1 and int.from_bytes(header[18:20], "little") == machine):
                binary = member
                break
        if binary is None:
            raise ValueError("No matching Android ELF in " + archive.name)
        destination.parent.mkdir(parents=True, exist_ok=True)
        pending = destination.with_suffix(".pending")
        try:
            with bundle.extractfile(binary) as source, pending.open("wb") as target:
                shutil.copyfileobj(source, target)
            pending.replace(destination)
        finally:
            if pending.exists():
                pending.unlink()

def main():
    cache = ROOT / "tools" / "cache"
    cache.mkdir(parents=True, exist_ok=True)
    for abi, (name, expected_hash) in ARCHIVES.items():
        archive = cache / name
        if not archive.is_file() or sha256(archive) != expected_hash:
            pending = archive.with_suffix(".download")
            print("Downloading " + name, flush=True)
            try:
                request = urllib.request.Request(RELEASE + name, headers={"User-Agent": "Caissa-build"})
                with urllib.request.urlopen(request, timeout=60) as response, pending.open("wb") as output:
                    shutil.copyfileobj(response, output)
                if sha256(pending) != expected_hash:
                    raise ValueError("Download SHA-256 mismatch: " + name)
                pending.replace(archive)
            finally:
                if pending.exists():
                    pending.unlink()
        install_archive(archive, expected_hash, abi, ROOT / "app" / "src" / "main" / "jniLibs" / abi / "libstockfish.so")
        print("Ready: " + abi, flush=True)

if __name__ == "__main__":
    main()

"""Import manifest-declared MY/JX files, or verify the saved baseline. Python stdlib only."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
VENDOR = ROOT / "vendor" / "interface"
INDEX = ROOT / "vendor" / "BASELINE.json"
PACKS = ("MY", "JX")


def parts(name):
    path = PurePosixPath(name.replace("\\", "/"))
    if path.is_absolute() or ":" in str(path) or ".." in path.parts or not path.parts:
        raise ValueError("Unsafe relative path: " + name)
    if any("#data" in p.lower() or p.lower() == "userdata" or
           p.lower().startswith("custom.dat") for p in path.parts):
        raise ValueError("User data is outside this import: " + name)
    return path.parts


def digest(data):
    return hashlib.sha256(data).hexdigest()


def source_plan(interface):
    files, addons, omitted = {}, [], {}
    for pack in PACKS:
        folder = interface / pack
        if not folder.is_dir():
            raise ValueError("Missing plugin folder: " + str(folder))
        selected = set()
        for addon in sorted(folder.iterdir()):
            if not addon.is_dir() or addon.is_symlink():
                raise ValueError("Unexpected plugin-root entry: " + str(addon))
            raw = (addon / "manifest.dat").read_bytes()
            try:
                manifest = json.loads(raw.decode("utf-8-sig"))
            except UnicodeDecodeError:
                manifest = json.loads(raw.decode("gb18030"))
            names = {}
            for row in manifest["files"]:
                relative = "/".join(parts(row["name"]))
                if relative in names:
                    raise ValueError("Duplicate manifest path: " + relative)
                names[relative] = row["value"].lower()
            for name in ("manifest.dat", "manifest.key", "publisher.key"):
                if (addon / name).is_file():
                    names.setdefault(name, None)
            for relative, expected_sha1 in sorted(names.items()):
                source = addon.joinpath(*parts(relative))
                if not source.resolve().is_relative_to(addon.resolve()):
                    raise ValueError("Plugin path escapes its addon: " + str(source))
                data = source.read_bytes()
                if expected_sha1 and hashlib.sha1(data).hexdigest() != expected_sha1:
                    raise ValueError("Publisher manifest hash mismatch: " + str(source))
                name = "/".join((pack, addon.name, relative))
                if name in files:
                    raise ValueError("Duplicate import path: " + name)
                files[name] = {"source": source, "size": len(data), "sha256": digest(data)}
                selected.add(source)
            addons.append({"pack": pack, "addon": addon.name,
                           "id": manifest.get("id"), "version": manifest.get("version")})
        all_files = {p for p in folder.rglob("*") if p.is_file()}
        omitted[pack] = len(all_files - selected)
    return files, addons, omitted


def import_baseline(interface):
    files, addons, omitted = source_plan(interface)
    record = {"format": 1, "source": "Frozen client interface/MY and interface/JX",
              "selection": "manifest-declared files plus manifest/signature metadata",
              "addons": addons, "unlisted_files_omitted": omitted,
              "files": {name: {"size": row["size"], "sha256": row["sha256"]}
                        for name, row in sorted(files.items())}}
    if INDEX.exists() and json.loads(INDEX.read_text(encoding="utf-8")) != record:
        raise ValueError("Baseline already exists with different contents; refusing to replace it")
    for name, row in files.items():
        target = VENDOR.joinpath(*parts(name))
        data = row["source"].read_bytes()
        if digest(data) != row["sha256"]:
            raise ValueError("Source changed during import: " + name)
        if target.exists():
            if target.read_bytes() != data:
                raise ValueError("Refusing to overwrite a different existing file: " + name)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
    INDEX.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def verify(interface=None):
    record = json.loads(INDEX.read_text(encoding="utf-8"))
    expected = record["files"]
    actual = {p.relative_to(VENDOR).as_posix() for p in VENDOR.rglob("*") if p.is_file()}
    if actual != set(expected):
        raise ValueError("Baseline file set differs: missing=%d, extra=%d" %
                         (len(set(expected) - actual), len(actual - set(expected))))
    for name, row in expected.items():
        path_parts = parts(name)
        if path_parts[0] not in PACKS:
            raise ValueError("Unexpected plugin pack: " + name)
        path = VENDOR.joinpath(*path_parts)
        if not path.resolve().is_relative_to(VENDOR.resolve()):
            raise ValueError("Baseline path escapes its folder: " + name)
        data = path.read_bytes()
        if len(data) != row["size"] or digest(data) != row["sha256"]:
            raise ValueError("Baseline bytes differ: " + name)
    if interface:
        files, _, _ = source_plan(interface)
        comparison = {n: {"size": r["size"], "sha256": r["sha256"]} for n, r in files.items()}
        if comparison != expected:
            raise ValueError("Frozen source differs from the saved baseline")
    print("PASS: %d files, %d addons; all baseline SHA-256 hashes match%s" %
          (len(expected), len(record["addons"]), "; frozen-source comparison passed" if interface else ""))
    for pack in PACKS:
        rows = [r for n, r in expected.items() if n.startswith(pack + "/")]
        print("%s: %d files, %d bytes" % (pack, len(rows), sum(r["size"] for r in rows)))


def verify_samples():
    root = ROOT / "samples"
    index = root / "SAMPLES.json"
    if not index.exists():
        return
    record = json.loads(index.read_text(encoding="utf-8"))
    expected = record["files"]
    metadata = {index, root / "README.md"}
    actual = {p.relative_to(root).as_posix() for p in root.rglob("*")
              if p.is_file() and p not in metadata}
    if actual != set(expected):
        raise ValueError("Sample file set differs: missing=%d, extra=%d" %
                         (len(set(expected) - actual), len(actual - set(expected))))
    for name, row in expected.items():
        path = root.joinpath(*parts(name))
        if not path.resolve().is_relative_to(root.resolve()):
            raise ValueError("Sample path escapes its folder: " + name)
        data = path.read_bytes()
        if len(data) != row["size"] or digest(data) != row["sha256"]:
            raise ValueError("Sample bytes differ: " + name)
    print("PASS: %d sample files; all sample SHA-256 hashes match" % len(expected))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--import-from", type=Path, metavar="INTERFACE")
    group.add_argument("--compare-source", type=Path, metavar="INTERFACE")
    args = parser.parse_args()
    try:
        if args.import_from:
            import_baseline(args.import_from)
        verify(args.import_from or args.compare_source)
        verify_samples()
    except (OSError, ValueError, KeyError) as error:
        raise SystemExit("FAIL: " + str(error))

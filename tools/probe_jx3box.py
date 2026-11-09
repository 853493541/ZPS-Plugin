"""Check homepage access separately from the buff API using inherited proxy settings."""
import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def probe(url, expect_json=False):
    result = {"requested_url": url}
    try:
        request = Request(url, headers={"Accept": "application/json" if expect_json else "text/html"})
        with urlopen(request, timeout=20) as response:
            result.update(status=response.status, final_url=response.url)
            if expect_json:
                raw = response.read(2 * 1024 * 1024 + 1)
                if len(raw) > 2 * 1024 * 1024:
                    raise ValueError("API response exceeds the diagnostic size limit")
                payload = json.loads(raw)
                if not isinstance(payload, dict) or not isinstance(payload.get("list"), list):
                    raise ValueError("API body does not contain the expected list")
                result["count"] = len(payload["list"])
                result["record_fields"] = sorted(payload["list"][0]) if payload["list"] and isinstance(payload["list"][0], dict) else []
                result["payload"] = payload
            result["ok"] = True
    except HTTPError as error:
        result.update(ok=False, status=error.code, error=f"HTTP {error.code}")
    except URLError as error:
        # Do not print a proxy URL, credentials, or arbitrary server-provided error text.
        reason = str(error.reason)
        result.update(ok=False, error="Proxy CONNECT rejected with 403" if "Tunnel connection failed: 403" in reason else "Connection failed before an HTTP response")
    except (ValueError, TimeoutError, OSError):
        result.update(ok=False, error="Response parsing, timeout, TLS, or connection failure")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("artifacts/jx3box-live.json"))
    args = parser.parse_args()
    report = {
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "homepage": probe("https://jx3box.com/"),
        "buff_api": probe("https://node.jx3box.com/buff/id/12784?client=std&level=1", True),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    summary = {key: {k: v for k, v in value.items() if k != "payload"} if isinstance(value, dict) else value for key, value in report.items()}
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print(f"Report saved to {args.output}")
    return 0 if report["buff_api"].get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())

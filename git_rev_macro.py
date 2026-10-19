import os
import subprocess
from datetime import datetime

def get_version():
    try:
        return subprocess.check_output(
            ["git", "describe", "--tags", "--always"],
            stderr=subprocess.DEVNULL
        ).decode().strip()
    except Exception:
        return "unknown"


def get_branch():
    try:
        branch = subprocess.check_output(
            ["git", "branch", "--show-current"],
            stderr=subprocess.DEVNULL
        ).decode().strip()
        if branch:
            return branch
    except Exception:
        pass

    return os.environ.get("GITHUB_REF_NAME") or os.environ.get("GITHUB_HEAD_REF") or "unknown"


version = get_version()
branch = get_branch()
build_time = datetime.now().astimezone().strftime("%Y-%m-%d %H:%M %z")

try:
    Import("env")
except NameError:
    print(f"-DFIRMWARE_VERSION='\"{version}\"' -DFIRMWARE_BRANCH='\"{branch}\"' "
          f"-DFIRMWARE_BUILD_TIME='\"{build_time}\"'")
else:
    env.Append(CPPDEFINES=[
        ("FIRMWARE_VERSION", f'\\"{version}\\"'),
        ("FIRMWARE_BRANCH", f'\\"{branch}\\"'),
        ("FIRMWARE_BUILD_TIME", f'\\"{build_time}\\"')
    ])

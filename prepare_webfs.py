Import("env")

import gzip
import os
import shutil
from datetime import datetime


project_dir = env.subst("$PROJECT_DIR")
source_dir = os.path.join(project_dir, "extras")
staging_dir = os.path.join(env.subst("$BUILD_DIR"), "webfs")
compress_extensions = {".css", ".html", ".js", ".json"}
web_build = datetime.now().astimezone().strftime("%Y%m%d%H%M%S")

def remove_staging_dir(path):
    # Windows can report a file as gone while rmtree is walking the build folder.
    # Retry only that race; permission and other filesystem errors must still fail.
    for _ in range(3):
        if not os.path.isdir(path):
            return
        try:
            shutil.rmtree(path)
            return
        except FileNotFoundError:
            pass

    if os.path.isdir(path):
        shutil.rmtree(path)


remove_staging_dir(staging_dir)

for root, _, files in os.walk(source_dir):
    relative_root = os.path.relpath(root, source_dir)
    output_root = staging_dir if relative_root == "." else os.path.join(staging_dir, relative_root)
    os.makedirs(output_root, exist_ok=True)

    for filename in files:
        source_path = os.path.join(root, filename)
        output_path = os.path.join(output_root, filename)
        extension = os.path.splitext(filename)[1].lower()
        is_web_asset = relative_root == "web_interface_data" or relative_root.startswith(
            "web_interface_data" + os.sep
        )

        if is_web_asset and extension in compress_extensions:
            with open(source_path, "rb") as source_file:
                content = source_file.read()
                if filename == "index.html":
                    content = content.replace(b"__WEB_BUILD__", web_build.encode("ascii"))
                with open(output_path + ".gz", "wb") as compressed_file:
                    with gzip.GzipFile(
                        filename="",
                        mode="wb",
                        compresslevel=9,
                        fileobj=compressed_file,
                        mtime=0,
                    ) as gzip_file:
                        gzip_file.write(content)
        else:
            shutil.copy2(source_path, output_path)

env.Replace(PROJECT_DATA_DIR=staging_dir)

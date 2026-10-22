"""使用实际 Java 校验器检查正常包与异常包，不运行 Android 或修改已发布产物。"""
from pathlib import Path
import hashlib
import io
import json
import os
import subprocess
import tempfile
import warnings
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
JAVA = Path(os.environ.get('YYAPP_SDK_JAVA_HOME', r'C:\Program Files\Unity 6000.0.59f2\Editor\Data\PlaybackEngines\AndroidPlayer\OpenJDK')) / 'bin'
CORE = ['index.html', 'manifest.json', 'css/style.css', 'css/learning.css', 'css/care.css',
        'js/app.js', 'js/update.js', 'js/learning.js', 'js/care.js', 'data/grade1.js',
        'data/grade2.js', 'data/grade3.js', 'data/phonics.js', 'data/vocabulary.js', 'data/textbook.js']


def archive(files):
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_STORED) as z:
        for name, data in files:
            z.writestr(name, data)
    return output.getvalue()


with tempfile.TemporaryDirectory(prefix='yyapp-package-') as folder:
    work = Path(folder)
    harness = work / 'CheckPackage.java'
    harness.write_text('''import java.io.File;
import com.family.englishquest.UpdatePackage;
public class CheckPackage {
  public static void main(String[] args) throws Exception {
    UpdatePackage.verifyAndExtract(new File(args[0]), new File(args[1]), Long.parseLong(args[2]), args[3]);
  }
}''', encoding='utf-8')
    subprocess.run([str(JAVA / 'javac.exe'), '-encoding', 'UTF-8', '-d', str(work),
                    str(ROOT / 'android-shell/app/src/main/java/com/family/englishquest/UpdatePackage.java'), str(harness)], check=True)
    old = work / 'old'
    old.mkdir()
    (old / 'index.html').write_bytes(b'current installed app')
    cases = 0

    def check(data, valid, size=None, digest=None):
        global cases
        cases += 1
        package = work / 'test.wgt'
        package.write_bytes(data)
        target = work / ('incoming-' + str(cases))
        result = subprocess.run([str(JAVA / 'java.exe'), '-cp', str(work), 'CheckPackage', str(package), str(target),
                                 str(len(data) if size is None else size), hashlib.sha256(data).hexdigest() if digest is None else digest], capture_output=True)
        assert (result.returncode == 0) == valid, result.stderr.decode(errors='replace')
        assert (old / 'index.html').read_bytes() == b'current installed app'
        return target

    files = [(name, (ROOT / name).read_bytes()) for name in CORE]
    published = json.loads((ROOT / 'release/version.json').read_text(encoding='utf-8'))
    check((ROOT / 'release' / published['wgt']).read_bytes(), True)
    good = archive(files)
    restored = check(good, True)
    for name, data in files:
        assert (restored / name).read_bytes() == data
    check(good, False, size=len(good) + 1)
    check(good, False, digest='0' * 64)
    check(good, False, digest='')
    check(good[:-22], False)  # 完整条目但缺少 ZIP 目录尾，不能当完整包安装。
    damaged = bytearray(good)
    damaged[30 + len('index.html')] ^= 1
    check(bytes(damaged), False)  # 即使外部哈希对应损坏文件，CRC 仍会拒绝。
    check(archive([files[0]]), False)
    for missing in CORE:
        check(archive([(name, data) for name, data in files if name != missing]), False)
    check(archive([(name, b'' if name == 'js/app.js' else data) for name, data in files]), False)
    check(archive([(name, b'' if name == 'data/textbook.js' else data) for name, data in files]), False)
    check(archive(files + [('../old/index.html', b'overwrite')]), False)
    with warnings.catch_warnings():
        warnings.simplefilter('ignore', UserWarning)
        check(archive(files + [files[0]]), False)

    # 验证发布工具输出的大小和哈希确实对应 WGT 文件。
    project = work / 'project'
    (project / 'tools').mkdir(parents=True)
    (project / 'tools/make_wgt.py').write_bytes((ROOT / 'tools/make_wgt.py').read_bytes())
    for name in ['index.html', 'manifest.json']:
        (project / name).write_bytes((ROOT / name).read_bytes())
    for directory in ['css', 'js', 'data', 'audio']:
        (project / directory).mkdir()
    for reference in re.findall(r"""(?:src|href)=["']([^"']+)["']""", (ROOT / 'index.html').read_text(encoding='utf-8')):
        target = project / reference
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes((ROOT / reference).read_bytes())
    subprocess.run([os.sys.executable, str(project / 'tools/make_wgt.py'), '--no-bump'], check=True, capture_output=True)
    info = json.loads((project / 'release/version.json').read_text(encoding='utf-8'))
    data = (project / 'release' / info['wgt']).read_bytes()
    assert info['wgtSize'] == len(data)
    assert info['wgtSha256'] == hashlib.sha256(data).hexdigest()
    (project / 'data/textbook.js').write_bytes(b'')
    failed = subprocess.run([os.sys.executable, str(project / 'tools/make_wgt.py'), '--no-bump'], capture_output=True)
    assert failed.returncode != 0, '入口引用的空资源必须阻止发布'
    (project / 'data/textbook.js').unlink()
    failed = subprocess.run([os.sys.executable, str(project / 'tools/make_wgt.py'), '--no-bump'], capture_output=True)
    assert failed.returncode != 0, '入口引用的缺失资源必须阻止发布'
    print(f'更新包验证通过：{cases} 个 Java 用例，覆盖正常解包、缺文件、空文件、大小与哈希、CRC、截断、路径越界、重复条目和旧版保留；发布元数据一致。')

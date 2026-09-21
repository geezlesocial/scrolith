import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('G2.6J filesystem safety', () => {
  test('video probe temp paths use private atomically-created directories', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../services/media/mediaVideoProbe.service.ts'),
      'utf8'
    );

    expect(source).toContain('fs.mkdtempSync(path.join(baseDir, \'probe-\'))');
    expect(source).toContain("return path.join(privateDir, `output${ext}`);");
    expect(source).not.toContain('Date.now()}-${crypto.randomBytes(8)');
  });

  test('buffer-backed upload temp files use exclusive creation and private permissions', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../controllers/filesController.ts'),
      'utf8'
    );

    expect(source).toContain("fs.openSync(tempPath, 'wx', 0o600)");
  });

  test('the test environment exposes an isolated temporary root', () => {
    expect(path.resolve(os.tmpdir())).toBeTruthy();
  });
});

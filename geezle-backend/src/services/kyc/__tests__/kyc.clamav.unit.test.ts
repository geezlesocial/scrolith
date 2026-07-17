import { scanBufferWithClamAv } from '../kyc.clamav.service';

describe('kyc.clamav', () => {
  const prev = process.env.CLAMAV_MODE;

  afterEach(() => {
    if (prev === undefined) delete process.env.CLAMAV_MODE;
    else process.env.CLAMAV_MODE = prev;
  });

  test('mock_clean returns clean', async () => {
    process.env.CLAMAV_MODE = 'mock_clean';
    const result = await scanBufferWithClamAv(Buffer.from('hello'));
    expect(result.clean).toBe(true);
    expect(result.infected).toBe(false);
    expect(result.unavailable).toBe(false);
  });

  test('mock_infected returns infected', async () => {
    process.env.CLAMAV_MODE = 'mock_infected';
    const result = await scanBufferWithClamAv(Buffer.from('eicar'));
    expect(result.clean).toBe(false);
    expect(result.infected).toBe(true);
  });

  test('disabled fails closed', async () => {
    process.env.CLAMAV_MODE = 'disabled';
    const result = await scanBufferWithClamAv(Buffer.from('x'));
    expect(result.clean).toBe(false);
    expect(result.unavailable).toBe(true);
  });
});

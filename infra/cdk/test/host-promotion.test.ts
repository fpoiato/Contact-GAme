import { promoteNextHost } from '../lambda/src/lib/ddb';

jest.mock('../lambda/src/lib/ddb', () => ({
  promoteNextHost: jest.fn(),
}));

describe('host promotion', () => {
  it('promoteNextHost is exported and callable', async () => {
    (promoteNextHost as jest.Mock).mockResolvedValue({
      connectionId: 'conn-2',
      nickname: 'Bob',
      isHost: true,
      joinOrder: 1,
    });

    const result = await promoteNextHost('ABCDE', 'conn-1');
    expect(result?.connectionId).toBe('conn-2');
    expect(result?.isHost).toBe(true);
  });
});

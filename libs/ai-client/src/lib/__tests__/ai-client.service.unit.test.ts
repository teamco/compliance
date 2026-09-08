import type { ClientProxy } from '@nestjs/microservices';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiClientService } from '../ai-client.service';

function makeClient(send: ClientProxy['send']): ClientProxy {
  return { send } as unknown as ClientProxy;
}

describe('AiClientService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves with the AI MS response on success', async () => {
    const send = vi.fn().mockReturnValue(of({ text: 'hi', inputTokens: 1, outputTokens: 1 }));
    const service = new AiClientService(makeClient(send));

    const result = await service.chat([], { userId: 'u1' } as never);

    expect(result).toEqual({ text: 'hi', inputTokens: 1, outputTokens: 1 });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('ai.chat', { messages: [], context: { userId: 'u1' } });
  });

  it('rejects once the timeout elapses on a call that never responds', async () => {
    const send = vi.fn().mockReturnValue(of({ text: 'ok' }).pipe());
    // Never-emitting observable — simulate a dropped socket.
    send.mockReturnValue({ subscribe: () => ({ unsubscribe: () => undefined }) });
    const service = new AiClientService(makeClient(send));

    const promise = service.chat([], {} as never);
    const assertion = expect(promise).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(90_000);
    await assertion;
  });

  it('retries once on a transport-level error, then succeeds', async () => {
    let calls = 0;
    const send = vi.fn().mockImplementation(() => {
      calls += 1;
      if (calls === 1)
        return throwError(() => Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }));
      return of({ text: 'recovered' });
    });
    const service = new AiClientService(makeClient(send));

    const promise = service.chat([], {} as never);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ text: 'recovered' });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('does not retry a non-transport error', async () => {
    const send = vi.fn().mockReturnValue(throwError(() => new Error('invalid request')));
    const service = new AiClientService(makeClient(send));

    await expect(service.chat([], {} as never)).rejects.toThrow('invalid request');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('opens the circuit breaker after repeated failures and fails fast without calling send', async () => {
    const send = vi.fn().mockReturnValue(throwError(() => new Error('ms down')));
    const service = new AiClientService(makeClient(send));

    for (let i = 0; i < 5; i++) {
      await expect(service.chat([], {} as never)).rejects.toThrow();
    }
    const callsBeforeOpen = send.mock.calls.length;

    await expect(service.chat([], {} as never)).rejects.toThrow(/circuit/i);
    expect(send).toHaveBeenCalledTimes(callsBeforeOpen); // breaker short-circuited, no new call
  });
});

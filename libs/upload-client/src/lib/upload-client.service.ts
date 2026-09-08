import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { signedSend } from '@icore/shared';
import type { StorageRef } from '@icore/shared';
import { UPLOAD_CLIENT } from './upload-client.tokens';

@Injectable()
export class UploadClientService {
  constructor(@Inject(UPLOAD_CLIENT) private readonly client: ClientProxy) {}

  upload(
    userId: string,
    file: { buffer: Buffer; filename: string; mimeType: string },
  ): Promise<StorageRef> {
    return signedSend<StorageRef>(this.client, 'storage.upload', {
      userId,
      file: {
        buffer: file.buffer.toString('base64'),
        filename: file.filename,
        mimeType: file.mimeType,
      },
    });
  }

  remove(userId: string, ref: StorageRef): Promise<void> {
    return signedSend<void>(this.client, 'storage.remove', { userId, ref });
  }

  signedUrl(userId: string, ref: StorageRef, ttlSec?: number): Promise<string> {
    return signedSend<string>(this.client, 'storage.signedUrl', { userId, ref, ttlSec });
  }

  list(userId: string, prefix?: string): Promise<StorageRef[]> {
    return signedSend<StorageRef[]>(this.client, 'storage.list', { userId, prefix });
  }
}

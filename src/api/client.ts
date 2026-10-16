import type { APIRequestContext, APIResponse } from "@playwright/test";

export type ResourceType = "DATAROOM" | "FOLDER" | "FILE";
export type ShareMode = "PUBLIC_LINK" | "USER";

export interface ApiResult<T = any> {
  status: number;
  body: T;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface UploadedFile {
  id: string;
  name: string;
}

async function toResult<T>(res: APIResponse): Promise<ApiResult<T>> {
  const text = await res.text();
  let body: any = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status(), body };
}

export class ApiClient {
  constructor(
    private readonly request: APIRequestContext,
    private readonly baseUrl: string,
    public token?: string,
  ) {}

  withToken(token?: string): ApiClient {
    return new ApiClient(this.request, this.baseUrl, token);
  }

  private headers(): Record<string, string> {
    return this.token ? { authorization: `Bearer ${this.token}` } : {};
  }

  async get<T = any>(path: string): Promise<ApiResult<T>> {
    return toResult(
      await this.request.get(this.baseUrl + path, { headers: this.headers() }),
    );
  }

  async post<T = any>(path: string, data?: unknown): Promise<ApiResult<T>> {
    return toResult(
      await this.request.post(this.baseUrl + path, {
        headers: this.headers(),
        data,
      }),
    );
  }

  async patch<T = any>(path: string, data?: unknown): Promise<ApiResult<T>> {
    return toResult(
      await this.request.patch(this.baseUrl + path, {
        headers: this.headers(),
        data,
      }),
    );
  }

  async delete<T = any>(path: string): Promise<ApiResult<T>> {
    return toResult(
      await this.request.delete(this.baseUrl + path, {
        headers: this.headers(),
      }),
    );
  }

  register(name: string, email: string, password: string) {
    return this.post<{ accessToken: string }>("/auth/register", {
      name,
      email,
      password,
    });
  }

  login(email: string, password: string) {
    return this.post<{ accessToken: string }>("/auth/login", {
      email,
      password,
    });
  }

  me() {
    return this.get("/auth/me");
  }

  listRooms() {
    return this.get<Page<{ id: string; name: string }>>("/data-rooms");
  }

  createRoom(name: string) {
    return this.post("/data-rooms", { name });
  }

  roomContents(roomId: string, query = "") {
    return this.get<Page<any>>(`/data-rooms/${roomId}/contents${query}`);
  }

  createFolder(dataRoomId: string, name: string, parentId?: string) {
    return this.post("/folders", { dataRoomId, name, parentId });
  }

  folderContents(folderId: string, query = "") {
    return this.get<Page<any>>(`/folders/${folderId}/contents${query}`);
  }

  breadcrumbs(folderId: string) {
    return this.get(`/folders/${folderId}/breadcrumbs`);
  }

  deletePreview(folderId: string) {
    return this.get(`/folders/${folderId}/delete-preview`);
  }

  renameFolder(folderId: string, name: string) {
    return this.patch(`/folders/${folderId}`, { name });
  }

  deleteFolder(folderId: string) {
    return this.delete(`/folders/${folderId}`);
  }

  uploadIntent(body: {
    dataRoomId: string;
    folderId?: string;
    name: string;
    size: number;
    mimeType: string;
  }) {
    return this.post<{ fileId: string; name: string; uploadUrl: string }>(
      "/files/upload-intent",
      body,
    );
  }

  async putToStorage(
    uploadUrl: string,
    content: Buffer | string,
    contentType = "application/pdf",
  ): Promise<number> {
    const res = await this.request.put(uploadUrl, {
      headers: { "content-type": contentType, "x-upsert": "true" },
      data: content,
    });
    return res.status();
  }

  completeUpload(fileId: string) {
    return this.post(`/files/${fileId}/complete`);
  }

  async uploadPdf(
    dataRoomId: string,
    name: string,
    content: Buffer,
    folderId?: string,
  ): Promise<UploadedFile> {
    const intent = await this.uploadIntent({
      dataRoomId,
      folderId,
      name,
      size: content.length,
      mimeType: "application/pdf",
    });
    if (intent.status !== 201) {
      throw new Error(
        `upload-intent failed: ${intent.status} ${JSON.stringify(intent.body)}`,
      );
    }
    const put = await this.putToStorage(intent.body.uploadUrl, content);
    if (put >= 300) throw new Error(`storage PUT failed: ${put}`);
    const done = await this.completeUpload(intent.body.fileId);
    if (done.status !== 201) {
      throw new Error(`complete failed: ${done.status}`);
    }
    return { id: intent.body.fileId, name: intent.body.name };
  }

  getFile(fileId: string) {
    return this.get(`/files/${fileId}`);
  }

  viewUrl(fileId: string) {
    return this.get<{ url: string }>(`/files/${fileId}/view-url`);
  }

  downloadUrl(fileId: string) {
    return this.get<{ url: string }>(`/files/${fileId}/download-url`);
  }

  renameFile(fileId: string, name: string) {
    return this.patch(`/files/${fileId}`, { name });
  }

  moveFile(fileId: string, targetFolderId: string | null) {
    return this.patch(`/files/${fileId}/move`, { targetFolderId });
  }

  deleteFile(fileId: string) {
    return this.delete(`/files/${fileId}`);
  }

  createShare(body: {
    resourceType: ResourceType;
    resourceId: string;
    mode: ShareMode;
    granteeEmail?: string;
  }) {
    return this.post("/shares", body);
  }

  listShares(resourceType: ResourceType, resourceId: string) {
    return this.get<Page<any>>(
      `/shares?resourceType=${resourceType}&resourceId=${resourceId}`,
    );
  }

  receivedShares() {
    return this.get<Page<any>>("/shares/received");
  }

  revokeShare(shareId: string) {
    return this.delete(`/shares/${shareId}`);
  }

  publicShare(token: string) {
    return this.get(`/public/${token}`);
  }

  publicContents(token: string) {
    return this.get<Page<any>>(`/public/${token}/contents`);
  }

  publicFolderContents(token: string, folderId: string) {
    return this.get<Page<any>>(`/public/${token}/folders/${folderId}/contents`);
  }

  publicFile(token: string, fileId: string) {
    return this.get(`/public/${token}/files/${fileId}`);
  }

  publicViewUrl(token: string, fileId: string) {
    return this.get<{ url: string }>(`/public/${token}/files/${fileId}/view-url`);
  }
}

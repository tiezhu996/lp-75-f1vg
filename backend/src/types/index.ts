import { Request } from 'express';
import { IUser } from '../models/User';

export interface AuthenticatedRequest extends Request {
  user?: IUser;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface JwtPayload {
  userId: string;
  username: string;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

export interface HeaderItem {
  key: string;
  value: string;
  enabled: boolean;
}

export interface EnvSnapshotVariable {
  key: string;
  value: string;
}

export interface EnvSnapshotPayload {
  environmentId: string;
  name: string;
  variables: EnvSnapshotVariable[];
}

export interface ProxyRequestData {
  method: HttpMethod;
  url: string;
  headers: HeaderItem[];
  body?: string;
  urlTemplate?: string;
  envSnapshot?: EnvSnapshotPayload | null;
}

export interface ProxyResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  duration: number;
}

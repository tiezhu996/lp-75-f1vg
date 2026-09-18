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

export interface EnvVariableSnapshot {
  key: string;
  value: string;
}

export interface ProxyRequestData {
  method: HttpMethod;
  url: string;
  headers: HeaderItem[];
  body?: string;
  /** 发送前包含 {{变量名}} 的原始 URL 模板 */
  urlTemplate?: string;
  /** 实际发送时使用的环境 ID */
  environmentId?: string;
  /** 实际发送时使用的环境名称 */
  environmentName?: string;
  /** 实际发送时的环境变量值快照 */
  envVariables?: EnvVariableSnapshot[];
}

export interface ProxyResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  duration: number;
}

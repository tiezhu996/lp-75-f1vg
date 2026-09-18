export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface User {
  id: string;
  username: string;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Header {
  key: string;
  value: string;
  enabled: boolean;
}

export interface EnvVariable {
  key: string;
  value: string;
}

export interface Environment {
  _id: string;
  userId: string;
  name: string;
  variables: EnvVariable[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Collection {
  _id: string;
  userId: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

export interface ApiEndpoint {
  _id: string;
  userId: string;
  collectionId: string;
  name: string;
  method: HttpMethod;
  url: string;
  headers: Header[];
  body?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProxyResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  duration: number;
  historyId: string;
}

export interface RequestHistory {
  _id: string;
  userId: string;
  method: HttpMethod;
  /** 实际发送（变量解析后）的 URL 地址 */
  url: string;
  /** 发送前包含 {{变量名}} 的原始 URL 模板 */
  urlTemplate?: string;
  /** 发送时使用的环境 ID */
  environmentId?: string;
  /** 发送时使用的环境名称 */
  environmentName?: string;
  /** 发送时的环境变量值快照 */
  envVariables?: EnvVariable[];
  headers: Header[];
  body?: string;
  response?: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string;
    duration: number;
  };
  createdAt: string;
}

export interface RequestConfig {
  method: HttpMethod;
  /** 实际发送（变量解析后）的 URL 地址 */
  url: string;
  /** 发送前包含 {{变量名}} 的原始 URL 模板 */
  urlTemplate?: string;
  environmentId?: string;
  environmentName?: string;
  envVariables?: EnvVariable[];
  headers: Header[];
  body?: string;
}

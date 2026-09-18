import mongoose, { Schema, Document } from 'mongoose';

export interface IHistoryHeader {
  key: string;
  value: string;
  enabled: boolean;
}

export interface IResponseData {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  duration: number;
}

export interface IEnvVariableSnapshot {
  key: string;
  value: string;
}

export interface IRequestHistory extends Document {
  userId: mongoose.Types.ObjectId;
  method: string;
  /** 实际发送（变量解析后）的 URL 地址 */
  url: string;
  /** 发送前包含 {{变量名}} 的原始 URL 模板 */
  urlTemplate?: string;
  /** 发送时使用的环境 ID */
  environmentId?: mongoose.Types.ObjectId;
  /** 发送时使用的环境名称 */
  environmentName?: string;
  /** 发送时的环境变量值快照 */
  envVariables?: IEnvVariableSnapshot[];
  headers: IHistoryHeader[];
  body?: string;
  response?: IResponseData;
  createdAt: Date;
}

const RequestHistorySchema: Schema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    method: {
      type: String,
      enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
      required: true,
    },
    url: {
      type: String,
      required: true,
    },
    urlTemplate: {
      type: String,
    },
    environmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Environment',
    },
    environmentName: {
      type: String,
      trim: true,
    },
    envVariables: [
      {
        _id: false,
        key: { type: String, trim: true },
        value: { type: String },
      },
    ],
    headers: [
      {
        key: { type: String, trim: true },
        value: { type: String, trim: true },
        enabled: { type: Boolean, default: true },
      },
    ],
    body: {
      type: String,
    },
    response: {
      status: { type: Number },
      statusText: { type: String },
      headers: { type: Schema.Types.Mixed },
      body: { type: String },
      duration: { type: Number },
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

RequestHistorySchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model<IRequestHistory>('RequestHistory', RequestHistorySchema);

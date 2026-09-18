import mongoose, { Schema, Document } from 'mongoose';

export interface IHistoryHeader {
  key: string;
  value: string;
  enabled: boolean;
}

export interface IEnvSnapshotVariable {
  key: string;
  value: string;
}

export interface IEnvironmentSnapshot {
  environmentId: mongoose.Types.ObjectId;
  name: string;
  variables: IEnvSnapshotVariable[];
}

export interface IResponseData {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  duration: number;
}

export interface IRequestHistory extends Document {
  userId: mongoose.Types.ObjectId;
  method: string;
  url: string;
  urlTemplate?: string;
  envSnapshot?: IEnvironmentSnapshot;
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
    // 发送时用户输入的原始 URL 模板（可能含 {{变量}}）
    urlTemplate: {
      type: String,
    },
    // 发送时的环境快照（环境名 + 变量值快照）
    envSnapshot: {
      environmentId: { type: Schema.Types.ObjectId },
      name: { type: String },
      variables: [
        {
          _id: false,
          key: { type: String, trim: true },
          value: { type: String },
        },
      ],
    },
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

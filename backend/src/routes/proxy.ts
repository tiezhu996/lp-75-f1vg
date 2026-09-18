import { Router, Response } from 'express';
import mongoose from 'mongoose';
import authMiddleware from '../middleware/auth';
import RequestHistory from '../models/RequestHistory';
import { AuthenticatedRequest, ApiResponse, ProxyRequestData, EnvVariableSnapshot } from '../types';
import { proxyRequest } from '../utils/proxy';
import { MAX_HISTORY_PER_USER } from './history';

const router = Router();

/** 规整前端上报的环境变量快照，仅保留合法的 key/value 字符串 */
const sanitizeEnvVariables = (variables: unknown): EnvVariableSnapshot[] => {
  if (!Array.isArray(variables)) {
    return [];
  }
  return variables
    .filter(
      (item): item is EnvVariableSnapshot =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as EnvVariableSnapshot).key === 'string' &&
        typeof (item as EnvVariableSnapshot).value === 'string'
    )
    .map((item) => ({ key: item.key.trim(), value: item.value }));
};

router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: '未授权访问' });
      return;
    }

    const {
      method,
      url,
      headers,
      body,
      urlTemplate,
      environmentId,
      environmentName,
      envVariables,
    } = req.body as ProxyRequestData;

    if (!method || !url) {
      res.status(400).json({
        success: false,
        message: '缺少必要参数',
      });
      return;
    }

    const response = await proxyRequest({ method, url, headers, body });

    const variableSnapshot = sanitizeEnvVariables(envVariables);
    // 仅当携带了有效的环境信息时才保存环境快照（环境允许没有变量）
    const hasValidEnvironmentId =
      typeof environmentId === 'string' && mongoose.Types.ObjectId.isValid(environmentId);
    const hasValidEnvironmentName =
      typeof environmentName === 'string' && environmentName.trim().length > 0;
    const hasEnvironmentSnapshot = hasValidEnvironmentId && hasValidEnvironmentName;

    const history = new RequestHistory({
      userId: req.user._id,
      method,
      url,
      urlTemplate: typeof urlTemplate === 'string' && urlTemplate.trim() ? urlTemplate : undefined,
      environmentId: hasEnvironmentSnapshot ? environmentId : undefined,
      environmentName: hasEnvironmentSnapshot ? environmentName.trim() : undefined,
      envVariables: hasEnvironmentSnapshot ? variableSnapshot : undefined,
      headers,
      body,
      response,
    });

    await history.save();

    const historyCount = await RequestHistory.countDocuments({ userId: req.user._id });

    if (historyCount > MAX_HISTORY_PER_USER) {
      const oldestRecords = await RequestHistory.find({ userId: req.user._id })
        .sort({ createdAt: 1 })
        .limit(historyCount - MAX_HISTORY_PER_USER);

      const idsToDelete = oldestRecords.map((record) => record._id);
      await RequestHistory.deleteMany({ _id: { $in: idsToDelete } });
    }

    res.json({
      success: true,
      data: {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        body: response.body,
        duration: response.duration,
        historyId: history._id.toString(),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : '代理请求失败',
    });
  }
});

export default router;

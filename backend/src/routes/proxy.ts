import { Router, Response } from 'express';
import mongoose from 'mongoose';
import authMiddleware from '../middleware/auth';
import RequestHistory from '../models/RequestHistory';
import { AuthenticatedRequest, ApiResponse, ProxyRequestData, EnvSnapshotPayload } from '../types';
import { proxyRequest } from '../utils/proxy';
import { MAX_HISTORY_PER_USER } from './history';

const router = Router();

// 规范化前端传来的环境快照，过滤非法字段，避免脏数据入库
const sanitizeEnvSnapshot = (raw: unknown): EnvSnapshotPayload | null => {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const candidate = raw as Partial<EnvSnapshotPayload>;
  const environmentId =
    typeof candidate.environmentId === 'string'
      ? candidate.environmentId
      : '';
  const name = typeof candidate.name === 'string' ? candidate.name : '';

  if (!mongoose.Types.ObjectId.isValid(environmentId) || !name.trim()) {
    return null;
  }

  const variables = Array.isArray(candidate.variables)
    ? candidate.variables
        .filter(
          (item): item is { key: string; value: string } =>
            !!item &&
            typeof item.key === 'string' &&
            item.key.trim().length > 0 &&
            typeof item.value === 'string'
        )
        .map((item) => ({ key: item.key.trim(), value: item.value }))
    : [];

  return { environmentId, name: name.trim(), variables };
};

router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: '未授权访问' });
      return;
    }

    const { method, url, headers, body, urlTemplate, envSnapshot } = req.body as ProxyRequestData;

    if (!method || !url) {
      res.status(400).json({
        success: false,
        message: '缺少必要参数',
      });
      return;
    }

    const response = await proxyRequest({ method, url, headers, body });

    // 原始模板缺省回退为实际解析地址，保证恢复与搜索逻辑统一
    const safeUrlTemplate = typeof urlTemplate === 'string' && urlTemplate.trim() ? urlTemplate : url;
    const safeEnvSnapshot = sanitizeEnvSnapshot(envSnapshot);

    const history = new RequestHistory({
      userId: req.user._id,
      method,
      url,
      urlTemplate: safeUrlTemplate,
      envSnapshot: safeEnvSnapshot
        ? {
            environmentId: new mongoose.Types.ObjectId(safeEnvSnapshot.environmentId),
            name: safeEnvSnapshot.name,
            variables: safeEnvSnapshot.variables,
          }
        : undefined,
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

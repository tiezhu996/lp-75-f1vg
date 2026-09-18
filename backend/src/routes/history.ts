import { Router, Response } from 'express';
import mongoose from 'mongoose';
import authMiddleware from '../middleware/auth';
import RequestHistory from '../models/RequestHistory';
import Environment from '../models/Environment';
import { AuthenticatedRequest, ApiResponse } from '../types';

const router = Router();

const MAX_HISTORY_PER_USER = 100;

interface EnvLeanDoc {
  _id: mongoose.Types.ObjectId;
  name: string;
  variables: { key: string; value: string }[];
}

interface ChangedVariable {
  key: string;
  snapshotValue: string | null;
  currentValue: string | null;
}

interface HistoryRecord {
  _id: unknown;
  method: string;
  url: string;
  urlTemplate?: string;
  envSnapshot?: {
    environmentId: mongoose.Types.ObjectId;
    name: string;
    variables: { key: string; value: string }[];
  };
  headers?: unknown;
  body?: unknown;
  response?: unknown;
  createdAt?: Date;
}

const TEMPLATE_VAR_REGEX = /\{\{([^}]+)\}\}/g;

// 提取 URL 模板中引用的变量名
const extractTemplateVariableKeys = (template?: string): string[] => {
  if (!template) {
    return [];
  }
  const keys: string[] = [];
  let match: RegExpExecArray | null;
  TEMPLATE_VAR_REGEX.lastIndex = 0;
  while ((match = TEMPLATE_VAR_REGEX.exec(template)) !== null) {
    const key = match[1].trim();
    if (key && !keys.includes(key)) {
      keys.push(key);
    }
  }
  return keys;
};

// 对比快照与当前环境，仅标注模板实际引用、且取值已发生变化的变量
const computeChangedVariables = (
  record: HistoryRecord,
  currentEnv: EnvLeanDoc | undefined
): ChangedVariable[] => {
  if (!record.envSnapshot || !currentEnv) {
    return [];
  }

  const referencedKeys = extractTemplateVariableKeys(record.urlTemplate);
  if (referencedKeys.length === 0) {
    return [];
  }

  const snapshotMap = new Map(
    record.envSnapshot.variables.map((variable) => [variable.key, variable.value])
  );
  const currentMap = new Map(currentEnv.variables.map((variable) => [variable.key, variable.value]));

  return referencedKeys
    .map((key) => ({
      key,
      snapshotValue: snapshotMap.has(key) ? (snapshotMap.get(key) as string) : null,
      currentValue: currentMap.has(key) ? (currentMap.get(key) as string) : null,
    }))
    // 快照与当前环境取值不一致（含新增 / 删除）才标注
    .filter((item) => item.snapshotValue !== item.currentValue);
};

router.get('/', authMiddleware, async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: '未授权访问' });
      return;
    }

    const { search, limit = 50 } = req.query;
    const limitNum = Math.min(parseInt(limit as string, 10) || 50, 100);

    const query: Record<string, unknown> = {
      userId: req.user._id,
    };

    if (search && (search as string).trim().length > 0) {
      const searchTerm = (search as string).trim();
      // 同时命中原始模板与实际解析地址
      query['$or'] = [
        { method: { $regex: searchTerm, $options: 'i' } },
        { url: { $regex: searchTerm, $options: 'i' } },
        { urlTemplate: { $regex: searchTerm, $options: 'i' } },
      ];
    }

    const records = await RequestHistory.find(query)
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .lean<HistoryRecord[]>();

    // 批量查询涉及的环境当前状态，避免逐条查询
    const environmentIds = Array.from(
      new Set(
        records
          .map((record) => record.envSnapshot?.environmentId)
          .filter((id): id is mongoose.Types.ObjectId => !!id)
          .map((id) => id.toString())
      )
    ).map((id) => new mongoose.Types.ObjectId(id));

    const environments = environmentIds.length
      ? await Environment.find({ _id: { $in: environmentIds } })
          .select('name variables')
          .lean<EnvLeanDoc[]>()
      : [];

    const envMap = new Map<string, EnvLeanDoc>(
      environments.map((env) => [env._id.toString(), env])
    );

    const data = records.map((record) => {
      const snapshotId = record.envSnapshot?.environmentId;
      const currentEnv = snapshotId
        ? envMap.get(snapshotId.toString())
        : undefined;

      return {
        ...record,
        envStatus: !record.envSnapshot
          ? null
          : currentEnv
          ? 'exists'
          : 'deleted',
        changedVariables: computeChangedVariables(record, currentEnv),
      };
    });

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '获取请求历史失败',
    });
  }
});

router.delete(
  '/:id',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: '未授权访问' });
        return;
      }

      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({
          success: false,
          message: '无效的历史记录 ID',
        });
        return;
      }

      const history = await RequestHistory.findOne({
        _id: id,
        userId: req.user._id,
      });

      if (!history) {
        res.status(404).json({
          success: false,
          message: '历史记录不存在',
        });
        return;
      }

      await history.deleteOne();

      res.json({
        success: true,
        message: '历史记录已删除',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: '删除历史记录失败',
      });
    }
  }
);

router.delete(
  '/',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response<ApiResponse>) => {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: '未授权访问' });
        return;
      }

      await RequestHistory.deleteMany({ userId: req.user._id });

      res.json({
        success: true,
        message: '历史记录已清空',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: '清空历史记录失败',
      });
    }
  }
);

export { router, MAX_HISTORY_PER_USER };

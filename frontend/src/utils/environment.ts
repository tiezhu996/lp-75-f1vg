import { Environment, EnvVariable, RequestHistory } from '../types';

export const replaceEnvVariables = (
  text: string,
  environment: Environment | null
): string => {
  if (!environment || !environment.variables) {
    return text;
  }

  let result = text;
  environment.variables.forEach((variable: EnvVariable) => {
    const pattern = new RegExp(`\\{\\{${variable.key}\\}\\}`, 'g');
    result = result.replace(pattern, variable.value);
  });

  return result;
};

export const extractEnvVariables = (text: string): string[] => {
  const regex = /\{\{([^}]+)\}\}/g;
  const matches: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (!matches.includes(match[1] as string)) {
      matches.push(match[1] as string);
    }
  }

  return matches;
};

export type EnvChangeType = 'changed' | 'added' | 'removed';

export interface EnvVariableChange {
  key: string;
  type: EnvChangeType;
  snapshotValue: string;
  currentValue: string;
}

export type HistoryEnvStatus = 'none' | 'matching' | 'changed' | 'missing' | 'switched';

export interface HistoryEnvState {
  /** 历史项是否保存了环境快照 */
  hasSnapshot: boolean;
  status: HistoryEnvStatus;
  /** 与当前激活环境相比发生变化的变量 */
  changes: EnvVariableChange[];
}

const toVariableMap = (variables?: EnvVariable[]): Map<string, string> => {
  const map = new Map<string, string>();
  (variables || []).forEach((variable) => {
    if (variable.key) {
      map.set(variable.key, variable.value ?? '');
    }
  });
  return map;
};

/**
 * 对比历史项保存时的环境快照与当前激活环境：
 * - missing: 历史使用的环境已被删除
 * - switched: 当前激活的是另一个环境
 * - changed: 同一环境，但变量值发生增删改
 * - matching: 同一环境且变量完全一致
 * - none: 历史项未使用环境（旧数据或未选择环境）
 */
export const inspectHistoryEnvironment = (
  item: RequestHistory,
  activeEnvironment: Environment | null
): HistoryEnvState => {
  if (!item.environmentId || !item.environmentName) {
    return { hasSnapshot: false, status: 'none', changes: [] };
  }

  if (!activeEnvironment || activeEnvironment._id !== item.environmentId) {
    return { hasSnapshot: true, status: activeEnvironment ? 'switched' : 'missing', changes: [] };
  }

  const snapshotMap = toVariableMap(item.envVariables);
  const currentMap = toVariableMap(activeEnvironment.variables);
  const changes: EnvVariableChange[] = [];

  snapshotMap.forEach((snapshotValue, key) => {
    if (!currentMap.has(key)) {
      changes.push({ key, type: 'removed', snapshotValue, currentValue: '' });
    } else if (currentMap.get(key) !== snapshotValue) {
      changes.push({
        key,
        type: 'changed',
        snapshotValue,
        currentValue: currentMap.get(key) ?? '',
      });
    }
  });

  currentMap.forEach((currentValue, key) => {
    if (!snapshotMap.has(key)) {
      changes.push({ key, type: 'added', snapshotValue: '', currentValue });
    }
  });

  return {
    hasSnapshot: true,
    status: changes.length > 0 ? 'changed' : 'matching',
    changes,
  };
};

export const ENV_CHANGE_LABELS: Record<EnvChangeType, string> = {
  changed: '已修改',
  added: '新增',
  removed: '已删除',
};

export const ENV_STATUS_LABELS: Record<Exclude<HistoryEnvStatus, 'none' | 'matching'>, string> = {
  changed: '环境变量已变化',
  missing: '原环境已删除',
  switched: '已切换到其他环境',
};

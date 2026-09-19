import type { ModelAlias } from '@/types';
import { readThinkingLevels } from './thinkingLevels';
import type { ModelEntryInput } from './types';

const formatJsonObject = (value?: Record<string, unknown>): string => {
  if (!value || Object.keys(value).length === 0) return '';
  return JSON.stringify(value, null, 2);
};

export const modelAliasToFormEntry = (model: ModelAlias): ModelEntryInput => ({
  name: model.name,
  alias: model.alias ?? '',
  priority: model.priority,
  testModel: model.testModel,
  image: model.image === true,
  maxContextLength: model.maxContextLength,
  inputModalities: model.inputModalities,
  thinkingJson: formatJsonObject(model.thinking),
  thinkingLevels: readThinkingLevels(model.thinking),
});

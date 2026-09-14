import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconChevronDown, IconPlus, IconX } from '@/components/ui/icons';
import { SelectionCheckbox } from '@/components/ui/SelectionCheckbox';
import { THINKING_LEVELS, type ThinkingLevel } from '../../thinkingLevels';
import type { ModelEntryInput } from '../../types';
import styles from './sharedForm.module.scss';

const COLLAPSED_LIMIT = 10;
const INPUT_MODALITY_OPTIONS = ['text', 'image'] as const;

interface ModelEntriesEditorProps {
  models: ModelEntryInput[];
  /** Only OpenAI-compatible entries can expose the image-generation capability. */
  supportsImage: boolean;
  /** Every backend provider model can override the Codex context window metadata. */
  supportsMaxContextLength: boolean;
  /** Only OpenAI-compatible entries can expose multimodal input declarations. */
  supportsInputModalities: boolean;
  /** Every backend provider model can override its thinking capability. */
  supportsThinking: boolean;
  mutating: boolean;
  removeDisabled: boolean;
  onUpdate: (idx: number, patch: Partial<ModelEntryInput>) => void;
  onAdd: () => void;
  onRemove: (idx: number) => void;
}

export function ModelEntriesEditor({
  models,
  supportsImage,
  supportsMaxContextLength,
  supportsInputModalities,
  supportsThinking,
  mutating,
  removeDisabled,
  onUpdate,
  onAdd,
  onRemove,
}: ModelEntriesEditorProps) {
  const { t } = useTranslation();
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);

  const handleAdd = () => {
    // New rows are appended; make sure the truncated list doesn't hide them.
    if (!showAll && models.length >= COLLAPSED_LIMIT) {
      setShowAll(true);
    }
    onAdd();
  };

  const handleRemove = (removeIdx: number) => {
    setExpandedIdx((prev) => {
      if (prev === null || prev === removeIdx) return null;
      return prev > removeIdx ? prev - 1 : prev;
    });
    onRemove(removeIdx);
  };

  const visible = showAll ? models : models.slice(0, COLLAPSED_LIMIT);

  return (
    <>
      {visible.map((entry, idx) => {
        const hasExtendedOptions =
          supportsImage || supportsMaxContextLength || supportsInputModalities || supportsThinking;
        const expanded = hasExtendedOptions && expandedIdx === idx;
        const thinkingLevels = entry.thinkingLevels ?? [];
        const inputModalities = entry.inputModalities ?? [];
        const hasThinking = entry.thinkingLevelsTouched
          ? thinkingLevels.length > 0
          : (entry.thinkingJson ?? '').trim().length > 0;
        const toggleThinkingLevel = (level: ThinkingLevel) => {
          const nextLevels = thinkingLevels.includes(level)
            ? thinkingLevels.filter((item) => item !== level)
            : THINKING_LEVELS.filter((item) => item === level || thinkingLevels.includes(item));
          onUpdate(idx, { thinkingLevels: nextLevels, thinkingLevelsTouched: true });
        };
        const toggleInputModality = (option: (typeof INPUT_MODALITY_OPTIONS)[number]) => {
          const nextModalities = inputModalities.includes(option)
            ? inputModalities.filter((item) => item !== option)
            : [...inputModalities, option];
          onUpdate(idx, { inputModalities: nextModalities });
        };
        return (
          <div key={idx} className={styles.modelEntry}>
            <div className={styles.modelAliasRow}>
              <input
                className={styles.input}
                placeholder="model-name"
                value={entry.name}
                onChange={(e) => onUpdate(idx, { name: e.target.value })}
                disabled={mutating}
              />
              <input
                className={styles.input}
                placeholder="alias (optional)"
                value={entry.alias ?? ''}
                onChange={(e) => onUpdate(idx, { alias: e.target.value })}
                disabled={mutating}
              />
              <div className={styles.modelEntryActions}>
                {supportsImage && !expanded && entry.image === true ? (
                  <span className={styles.entryBadge}>
                    {t('providersPage.form.modelBadgeImage')}
                  </span>
                ) : null}
                {supportsThinking && !expanded && hasThinking ? (
                  <span className={styles.entryBadge}>
                    {t('providersPage.form.modelBadgeThinking')}
                  </span>
                ) : null}
                {supportsMaxContextLength && !expanded && entry.maxContextLength ? (
                  <span className={styles.entryBadge}>
                    {t('providersPage.form.modelBadgeContext')}
                  </span>
                ) : null}
                {supportsInputModalities && !expanded && inputModalities.length > 0 ? (
                  <span className={styles.entryBadge}>
                    {t('providersPage.form.modelBadgeModalities')}
                  </span>
                ) : null}
                {hasExtendedOptions ? (
                  <button
                    type="button"
                    className={styles.entryCardIconBtn}
                    onClick={() => setExpandedIdx(expanded ? null : idx)}
                    title={expanded ? t('common.collapse') : t('common.expand')}
                    aria-label={expanded ? t('common.collapse') : t('common.expand')}
                    aria-expanded={expanded}
                  >
                    <IconChevronDown
                      className={[
                        styles.entryCardChevron,
                        expanded ? styles.entryCardChevronOpen : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      size={14}
                    />
                  </button>
                ) : null}
                <button
                  type="button"
                  className={styles.removeBtn}
                  disabled={mutating || removeDisabled}
                  onClick={() => handleRemove(idx)}
                >
                  <IconX size={12} />
                </button>
              </div>
            </div>
            {expanded ? (
              <div className={styles.modelEntryDetails}>
                {supportsMaxContextLength ? (
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor={`model-max-context-${idx}`}>
                      {t('providersPage.form.modelMaxContextLength')}
                    </label>
                    <input
                      id={`model-max-context-${idx}`}
                      type="number"
                      min={1}
                      className={styles.input}
                      value={entry.maxContextLength ?? ''}
                      onChange={(e) =>
                        onUpdate(idx, {
                          maxContextLength:
                            e.target.value === '' ? undefined : Number(e.target.value),
                        })
                      }
                      disabled={mutating}
                    />
                    <small className={styles.labelHint}>
                      {t('providersPage.form.modelMaxContextLengthHint')}
                    </small>
                  </div>
                ) : null}
                {supportsImage ? (
                  <label className={styles.checkboxRow}>
                    <input
                      type="checkbox"
                      className={styles.checkboxBox}
                      checked={entry.image === true}
                      disabled={mutating}
                      onChange={(e) => onUpdate(idx, { image: e.target.checked })}
                    />
                    <span className={styles.checkboxText}>
                      <span>{t('providersPage.form.modelImage')}</span>
                      <small>{t('providersPage.form.modelImageHint')}</small>
                    </span>
                  </label>
                ) : null}
                {supportsInputModalities ? (
                  <fieldset className={styles.thinkingFieldset}>
                    <legend className={styles.label}>
                      {t('providersPage.form.modelInputModalities')}
                    </legend>
                    <div className={styles.thinkingLevelGrid}>
                      {INPUT_MODALITY_OPTIONS.map((option) => (
                        <SelectionCheckbox
                          key={option}
                          checked={inputModalities.includes(option)}
                          disabled={mutating}
                          onChange={() => toggleInputModality(option)}
                          className={`${styles.thinkingLevelOption} ${
                            inputModalities.includes(option)
                              ? styles.thinkingLevelOptionSelected
                              : ''
                          }`}
                          labelClassName={styles.thinkingLevelLabel}
                          label={
                            <>
                              <span>{option}</span>
                              <code>{option}</code>
                            </>
                          }
                        />
                      ))}
                    </div>
                    <small className={styles.labelHint}>
                      {t('providersPage.form.modelInputModalitiesHint')}
                    </small>
                  </fieldset>
                ) : null}
                {supportsThinking ? (
                  <fieldset className={styles.thinkingFieldset}>
                    <legend className={styles.label}>
                      {t('providersPage.form.thinkingConfig')}
                    </legend>
                    <div className={styles.thinkingLevelGrid}>
                      {THINKING_LEVELS.map((level) => (
                        <SelectionCheckbox
                          key={level}
                          checked={thinkingLevels.includes(level)}
                          disabled={mutating}
                          onChange={() => toggleThinkingLevel(level)}
                          className={`${styles.thinkingLevelOption} ${
                            thinkingLevels.includes(level) ? styles.thinkingLevelOptionSelected : ''
                          }`}
                          labelClassName={styles.thinkingLevelLabel}
                          label={
                            <>
                              <span>{t(`providersPage.form.thinkingLevels.${level}`)}</span>
                              <code>{level}</code>
                            </>
                          }
                        />
                      ))}
                    </div>
                    {(entry.thinkingJson ?? '').trim() && !entry.thinkingLevelsTouched ? (
                      <p className={styles.thinkingExistingHint}>
                        {t('providersPage.form.thinkingExistingHint')}
                      </p>
                    ) : null}
                  </fieldset>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
      {models.length > COLLAPSED_LIMIT ? (
        <button type="button" className={styles.showMoreBtn} onClick={() => setShowAll((v) => !v)}>
          {showAll
            ? t('providersPage.form.showFewerEntries')
            : t('providersPage.form.showAllEntries', { count: models.length })}
        </button>
      ) : null}
      <button type="button" className={styles.addBtn} disabled={mutating} onClick={handleAdd}>
        <IconPlus size={12} />
        <span>{t('providersPage.form.addModel')}</span>
      </button>
    </>
  );
}

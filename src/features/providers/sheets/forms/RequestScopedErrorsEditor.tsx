import { useTranslation } from 'react-i18next';
import { IconPlus, IconX } from '@/components/ui/icons';
import { Select } from '@/components/ui/Select';
import type { RequestScopedErrorAction, RequestScopedErrorRule } from '@/types';
import styles from './sharedForm.module.scss';

const ACTIONS: RequestScopedErrorAction[] = [
  'stop',
  'stop-and-cooldown',
  'continue',
  'continue-and-cooldown',
];

const splitLines = (value: string): string[] => value.split(/\r?\n/);

interface RequestScopedErrorsEditorProps {
  rules: RequestScopedErrorRule[];
  disabled: boolean;
  onChange: (rules: RequestScopedErrorRule[]) => void;
}

export function RequestScopedErrorsEditor({
  rules,
  disabled,
  onChange,
}: RequestScopedErrorsEditorProps) {
  const { t } = useTranslation();

  const updateRule = (index: number, patch: Partial<RequestScopedErrorRule>) => {
    onChange(rules.map((rule, current) => (current === index ? { ...rule, ...patch } : rule)));
  };

  return (
    <div className={styles.entriesList}>
      {rules.map((rule, index) => (
        <div className={styles.entryCard} key={index}>
          <div className={styles.entryCardHeader}>
            <span>{t('providersPage.form.requestScopedRule', { number: index + 1 })}</span>
            <button
              type="button"
              className={styles.removeBtn}
              disabled={disabled}
              onClick={() => onChange(rules.filter((_, current) => current !== index))}
              aria-label={t('providersPage.form.removeRequestScopedRule')}
            >
              <IconX size={12} />
            </button>
          </div>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label className={styles.label}>{t('providersPage.form.requestScopedStatus')}</label>
              <input
                className={styles.input}
                type="number"
                min={100}
                max={599}
                value={rule.status ?? ''}
                onChange={(event) =>
                  updateRule(index, {
                    status: event.target.value === '' ? undefined : Number(event.target.value),
                  })
                }
                disabled={disabled}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>{t('providersPage.form.requestScopedAction')}</label>
              <Select
                value={rule.action ?? 'continue'}
                options={ACTIONS.map((action) => ({
                  value: action,
                  label: t(`providersPage.form.requestScopedAction_${action}`),
                }))}
                onChange={(value) =>
                  updateRule(index, { action: value as RequestScopedErrorAction })
                }
                disabled={disabled}
                ariaLabel={t('providersPage.form.requestScopedAction')}
              />
            </div>
          </div>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label className={styles.label}>{t('providersPage.form.requestScopedMatch')}</label>
              <textarea
                className={styles.textarea}
                rows={3}
                value={(rule.match ?? []).join('\n')}
                onChange={(event) => updateRule(index, { match: splitLines(event.target.value) })}
                placeholder={t('providersPage.form.requestScopedMatchPlaceholder')}
                disabled={disabled}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>{t('providersPage.form.requestScopedRegex')}</label>
              <textarea
                className={styles.textarea}
                rows={3}
                value={(rule.matchRegexr ?? []).join('\n')}
                onChange={(event) =>
                  updateRule(index, { matchRegexr: splitLines(event.target.value) })
                }
                placeholder={t('providersPage.form.requestScopedRegexPlaceholder')}
                disabled={disabled}
              />
            </div>
          </div>
        </div>
      ))}
      <button
        type="button"
        className={styles.addBtn}
        disabled={disabled}
        onClick={() => onChange([...rules, { status: 400, action: 'continue' }])}
      >
        <IconPlus size={12} />
        <span>{t('providersPage.form.addRequestScopedRule')}</span>
      </button>
    </div>
  );
}

import type { BeanStatus } from '@shared/lookups';
import type { IconName } from '../components/Icon';

/** A bag's status as a line icon (shown in brown), in place of the emoji. */
export const STATUS_ICON: Record<BeanStatus, IconName> = {
  ordered: 'receipt',
  resting: 'moon',
  freezing: 'snowflake',
  drinking: 'coffee',
  finished: 'check',
};

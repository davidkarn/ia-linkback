// Books' copyright statuses (see the admin panel's Copyright tab)
import type { CopyrightStatus } from '../api'

export const COPYRIGHT_LABELS: Record<CopyrightStatus, string> = {
  likely_public_domain:   'Likely public domain',
  probably_public_domain: 'Probably public domain',
  doubtful_public_domain: 'Doubtful public domain',
  likely_copyrighted:     'Likely copyrighted',
};

// The notes kept with a status set by hand
export const MANUAL_NOTES = 'Set by hand in the admin panel';

export type DangerConfirmTone = 'caution' | 'danger';

export type DangerConfirmRequest = {
  keep: string;
  message: string;
  onConfirm: () => void;
  title: string;
  tone: DangerConfirmTone;
  word?: string;
};

import { useState } from 'react';
import { isWorkshopAssetProtocolUrl } from './workshopAssetUrl';

type WorkshopProtocolImageProps = {
  src: string;
  className?: string;
  allowedPrefix?: 'echo-workshop://asset/' | 'echo-workshop://preview/';
};

export const WorkshopProtocolImage = ({
  src,
  className,
  allowedPrefix = 'echo-workshop://asset/',
}: WorkshopProtocolImageProps): JSX.Element | null => {
  const [failed, setFailed] = useState(false);
  if (failed || typeof src !== 'string' || !src.startsWith(allowedPrefix)) {
    return null;
  }
  if (allowedPrefix === 'echo-workshop://asset/' && !isWorkshopAssetProtocolUrl(src)) {
    return null;
  }
  return (
    <img
      className={className}
      alt=""
      draggable={false}
      src={src}
      onError={() => setFailed(true)}
    />
  );
};

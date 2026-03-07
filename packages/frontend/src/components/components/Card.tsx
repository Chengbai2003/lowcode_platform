import React from 'react';
import { Card as AntCard } from 'antd';

/**
 * 卡片组件
 */
export interface CardProps extends React.ComponentProps<typeof AntCard> {}

export const Card: React.FC<CardProps> = (props) => {
  return <AntCard {...props} />;
};

Card.displayName = 'Card';

export default Card;

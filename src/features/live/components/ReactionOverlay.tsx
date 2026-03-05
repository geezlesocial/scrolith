import React from 'react';

type OverlayReaction = {
  id: string;
  emoji: string;
};

type ReactionOverlayProps = {
  items: OverlayReaction[];
};

const ReactionOverlay: React.FC<ReactionOverlayProps> = ({ items }) => {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {items.map((item, index) => (
        <span
          key={item.id}
          className="absolute bottom-8 text-2xl opacity-90 animate-[floatUp_1200ms_ease-out_forwards]"
          style={{
            left: `${15 + ((index * 17) % 70)}%`
          }}
        >
          {item.emoji}
        </span>
      ))}
      <style>
        {`@keyframes floatUp { 0% { transform: translateY(0) scale(0.85); opacity: 0.2; } 20% { opacity: 1; } 100% { transform: translateY(-120px) scale(1.1); opacity: 0; } }`}
      </style>
    </div>
  );
};

export default ReactionOverlay;

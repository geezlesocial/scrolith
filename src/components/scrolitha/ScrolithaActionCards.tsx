import React from 'react';

export type ActionCard = {
  id: string;
  kind: string;
  label: string;
  description: string;
  priority?: number;
};

type Props = {
  cards: ActionCard[];
  disabled?: boolean;
  onSelect: (card: ActionCard) => void;
};

const ScrolithaActionCards: React.FC<Props> = ({ cards, disabled, onSelect }) => {
  if (!cards?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5" role="list" aria-label="Scrolitha action cards">
      {cards.map((card) => (
        <button
          key={card.id}
          type="button"
          role="listitem"
          disabled={disabled}
          title={card.description}
          onClick={() => onSelect(card)}
          className="rounded-full border border-cyan-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-cyan-950 transition hover:bg-cyan-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600 disabled:opacity-50"
        >
          {card.label}
        </button>
      ))}
    </div>
  );
};

export default ScrolithaActionCards;

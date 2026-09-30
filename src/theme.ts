export const theme = {
  crimson: 0x85150F, orange: 0xCB6325, beige: 0xE0D5C1, stone: 0x8B8672, black: 0x000000,
  ink: 0x190406, navy: 0x21263A, teal: 0x274558, sage: 0x8F9A7E, peach: 0xEDB57C, coral: 0xE5805B,
  forestDark: 0x1B2A19, forest: 0x2D5128, fern: 0x537B2F, moss: 0x8DA750, lime: 0xE4EDB0,
} as const;

export const hex = (n: number): string => '#' + n.toString(16).padStart(6, '0');

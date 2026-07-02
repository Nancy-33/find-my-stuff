export interface Annotation {
  id: string;
  /** X position as ratio 0-1 relative to image width */
  x: number;
  /** Y position as ratio 0-1 relative to image height */
  y: number;
  /** Circle radius in screen-independent units */
  radius: number;
  /** Text label for this annotation */
  label: string;
}

export interface Item {
  id: string;
  /** Local file URI of the photo */
  photoUri: string;
  /** All annotations (circles + labels) on this photo */
  annotations: Annotation[];
  /** Overall note about the item location */
  note: string;
  /** Tags for categorization: bedroom, kitchen, etc. */
  tags: string[];
  createdAt: number; // timestamp
}

export type RootStackParamList = {
  Home: undefined;
  Camera: undefined;
  Annotation: { photoUri: string };
  Detail: { itemId: string };
};

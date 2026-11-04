export interface SearchHit {
  id: string;
  name: string;
  slug: string;
  sku: string;
  brand: string;
  category: string;
  price: number;
  compareAtPrice?: number;
  currency: string;
  thumbnailUrl: string;
  inStock: boolean;
  stockQuantity: number;
  highlight?: string;
}

export interface AutocompleteResult {
  query: string;
  totalMatches: number;
  suggestions: string[];
  products: SearchHit[];
}

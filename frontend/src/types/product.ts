export interface Product {
  id: string;
  sku: string;                   // "Կոդ"
  name: string;                  // "Անվանում" / "Լրիվ անվանում"
  slug: string;
  unit_of_measure: string;       // "Չափման միավոր" (e.g., տուփ, հատ)
  category: string;              // "Խումբ" (default: "Uncategorized")
  retail_price: number;          // "Մանրածախ գին դրամով"
  wholesale_price: number;       // "Մեծածախ գին դրամով"
  barcode?: string | null;       // "Գծիկավոր կոդ"
  vat_applicable: boolean;       // "ԱԱՀ"
  discount_percent: number;      // "Զեղչ (%)"
  description?: string | null;   // "Բնութագիր"
  image_url?: string | null;     // "Նկար"
  is_active: boolean;            // Derived from "Փակված" (False -> True)

  // Storefront UI & Compatibility Fields
  brand: string;
  price: number;                 // Synced with retail_price
  compareAtPrice?: number;
  currency: string;
  inStock: boolean;
  stockQuantity: number;
  ratingAverage: number;
  ratingCount: number;
  imageUrl: string;
  thumbnailUrl: string;
  shortDescription?: string;
  specifications: Record<string, string>;
  isNew?: boolean;
}

export interface FilterState {
  searchQuery?: string;
  selectedBrands: string[];
  selectedCategories: string[];
  priceRange: [number, number];
  inStockOnly: boolean;
  selectedVoltages: string[];
}

export interface FacetOption {
  value: string;
  label: string;
  count: number;
}

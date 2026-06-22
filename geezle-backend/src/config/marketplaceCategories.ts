export type MarketplaceSeedCategory = {
  name: string;
  description: string;
  slug: string;
};

export const DEFAULT_MARKETPLACE_CATEGORIES: MarketplaceSeedCategory[] = [
  { name: 'Electronics', slug: 'electronics', description: 'Phones, gadgets, accessories, and smart devices.' },
  { name: 'Phones & Tablets', slug: 'phones-tablets', description: 'Smartphones, tablets, cases, chargers, and related accessories.' },
  { name: 'Computers', slug: 'computers', description: 'Laptops, desktops, parts, peripherals, and computer accessories.' },
  { name: 'Cameras & Photography', slug: 'cameras-photography', description: 'Cameras, lenses, lighting gear, drones, and photography tools.' },
  { name: 'Gaming', slug: 'gaming', description: 'Consoles, games, handhelds, gaming PCs, and gaming accessories.' },
  { name: 'Audio', slug: 'audio', description: 'Headphones, speakers, microphones, instruments, and studio equipment.' },
  { name: 'Home & Kitchen', slug: 'home-kitchen', description: 'Home essentials, cookware, decor, storage, and kitchen tools.' },
  { name: 'Furniture', slug: 'furniture', description: 'Desks, chairs, beds, sofas, shelves, and home furniture.' },
  { name: 'Appliances', slug: 'appliances', description: 'Large and small appliances for home and office use.' },
  { name: 'Fashion', slug: 'fashion', description: 'Clothing, apparel, and personal style items.' },
  { name: 'Shoes & Bags', slug: 'shoes-bags', description: 'Sneakers, formal shoes, handbags, backpacks, and travel bags.' },
  { name: 'Beauty & Personal Care', slug: 'beauty-personal-care', description: 'Beauty products, skincare, grooming tools, and wellness items.' },
  { name: 'Baby & Kids', slug: 'baby-kids', description: 'Baby gear, kids essentials, toys, and family-focused items.' },
  { name: 'Books & Stationery', slug: 'books-stationery', description: 'Books, learning materials, office supplies, and stationery.' },
  { name: 'Sports & Outdoors', slug: 'sports-outdoors', description: 'Fitness gear, outdoor equipment, team sports, and recreation items.' },
  { name: 'Automotive', slug: 'automotive', description: 'Vehicle accessories, tools, parts, and car care products.' },
  { name: 'Tools & Industrial', slug: 'tools-industrial', description: 'Hand tools, power tools, workshop gear, and industrial equipment.' },
  { name: 'Health & Wellness', slug: 'health-wellness', description: 'Health devices, supplements, rehab tools, and wellness products.' },
  { name: 'Collectibles', slug: 'collectibles', description: 'Rare items, memorabilia, trading cards, and collector goods.' },
  { name: 'Other', slug: 'other-marketplace', description: 'Everything else that does not fit a main marketplace category.' }
];

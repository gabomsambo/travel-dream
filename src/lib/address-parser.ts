interface AddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

export interface ParsedAddress {
  city: string | null;
  admin: string | null;
  country: string | null;
  address: string | null;
  postalCode: string | null;
}

const CITY_TYPES = [
  'locality',
  'postal_town',
  'sublocality_level_1',
  'administrative_area_level_2',
  'administrative_area_level_1',
] as const;

const ADMIN_TYPES = [
  'administrative_area_level_1',
  'administrative_area_level_2',
] as const;

export function parseAddressComponents(
  components: AddressComponent[],
  formattedAddress?: string
): ParsedAddress {
  const findByType = (types: readonly string[]): string | null => {
    for (const type of types) {
      const component = components.find(c => c.types.includes(type));
      if (component) {
        return component.long_name;
      }
    }
    return null;
  };

  const findByExactType = (type: string): string | null => {
    const component = components.find(c => c.types.includes(type));
    return component?.long_name || null;
  };

  const city = findByType(CITY_TYPES);

  let admin = findByExactType('administrative_area_level_1');
  if (admin === city) {
    admin = findByExactType('administrative_area_level_2');
  }

  const country = findByExactType('country');
  const postalCode = findByExactType('postal_code');

  const address = formattedAddress || null;

  return {
    city,
    admin,
    country,
    address,
    postalCode,
  };
}

export function getComponentByType(
  components: AddressComponent[],
  type: string
): AddressComponent | undefined {
  return components.find(c => c.types.includes(type));
}

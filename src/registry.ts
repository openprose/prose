export interface RegistryRef {
  catalog: string;
  package_name: string;
  version: string;
  component: string | null;
  ref: string;
}

export function parseRegistryRef(value: string): RegistryRef | null {
  if (!value.startsWith("registry://")) {
    return null;
  }

  const withoutScheme = value.slice("registry://".length);
  const slash = withoutScheme.indexOf("/");
  if (slash <= 0) {
    return null;
  }

  const catalog = withoutScheme.slice(0, slash).trim();
  const remainder = withoutScheme.slice(slash + 1);
  if (!catalog || !remainder) {
    return null;
  }

  const versionMarker = remainder.lastIndexOf("@");
  if (versionMarker <= 0) {
    return null;
  }

  const packageName = remainder.slice(0, versionMarker).trim();
  const afterVersion = remainder.slice(versionMarker + 1);
  if (!packageName || !afterVersion) {
    return null;
  }

  const componentSeparator = afterVersion.indexOf("/");
  const version =
    componentSeparator >= 0 ? afterVersion.slice(0, componentSeparator) : afterVersion;
  const component =
    componentSeparator >= 0 ? afterVersion.slice(componentSeparator + 1).trim() : null;

  if (!version) {
    return null;
  }

  return {
    catalog,
    package_name: packageName,
    version,
    component: component || null,
    ref: buildRegistryRef({
      catalog,
      package_name: packageName,
      version,
      component: component || null,
    }),
  };
}

export function buildRegistryRef(options: {
  catalog: string;
  package_name: string;
  version: string;
  component?: string | null;
}): string {
  const base = `registry://${options.catalog}/${options.package_name}@${options.version}`;
  return options.component ? `${base}/${options.component}` : base;
}

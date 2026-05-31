const fs = require('fs');
const path = require('path');

const readManifest = () => {
  const manifestPath = path.resolve(__dirname, '../../config/module-manifest.json');
  const raw = fs.readFileSync(manifestPath, 'utf8');
  return JSON.parse(raw);
};

const stringifyJs = (value) => {
  return JSON.stringify(value, null, 2);
};

const buildMiniprogramModules = (manifest) => {
  const out = {};
  const order = manifest.order || [];
  const modules = manifest.modules || {};
  order.forEach((key) => {
    const def = modules[key];
    if (!def) return;
    out[key] = {
      key: def.key,
      label: def.label,
      desc: def.desc,
      reviewLayout: def.reviewLayout,
      includeSkuCode: Boolean(def.ui && def.ui.includeSkuCode),
      showSupplierField: Boolean(def.ui && def.ui.showSupplierField),
      showSalesFields: Boolean(def.ui && def.ui.showSalesFields),
      defaults: def.defaults || {},
      requiredGroupFields: def.requiredGroupFields || [],
    };
  });
  return out;
};

const buildServerModules = (manifest) => {
  const out = {};
  const order = manifest.order || [];
  const modules = manifest.modules || {};
  order.forEach((key) => {
    const def = modules[key];
    if (!def) return;
    out[key] = {
      key: def.key,
      label: def.label,
      writeMode: def.writeMode,
      fields: def.fields || {},
      recognition: def.recognition || {},
      sync: def.sync || {},
    };
  });
  return out;
};

const writeModuleFile = (filePath, modules) => {
  const content = `const MODULES = ${stringifyJs(modules)};\n\nmodule.exports = { MODULES };\n`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
};

const buildModuleFileContent = (modules) => {
  return `const MODULES = ${stringifyJs(modules)};\n\nmodule.exports = { MODULES };\n`;
};

const getOutputPaths = () => ({
  miniprogram: path.resolve(__dirname, '../../miniprogram/config/modules.shared.js'),
  server: path.resolve(__dirname, '../src/config/modules.shared.js'),
});

const main = () => {
  const manifest = readManifest();
  const miniprogramModules = buildMiniprogramModules(manifest);
  const serverModules = buildServerModules(manifest);
  const outputPaths = getOutputPaths();

  writeModuleFile(outputPaths.miniprogram, miniprogramModules);
  writeModuleFile(outputPaths.server, serverModules);
};

if (require.main === module) {
  main();
}

module.exports = {
  buildMiniprogramModules,
  buildModuleFileContent,
  buildServerModules,
  getOutputPaths,
  main,
  readManifest,
};

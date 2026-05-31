const MODULES = {
  "purchase": {
    "key": "purchase",
    "label": "采购",
    "desc": "数量累加写入采购表",
    "reviewLayout": "grouped",
    "includeSkuCode": true,
    "showSupplierField": true,
    "showSalesFields": false,
    "defaults": {
      "quantity": 1
    },
    "requiredGroupFields": [
      "category"
    ]
  },
  "sales": {
    "key": "sales",
    "label": "销售",
    "desc": "明细流水（每次新增）",
    "reviewLayout": "list",
    "includeSkuCode": false,
    "showSupplierField": false,
    "showSalesFields": true,
    "defaults": {
      "quantity": 1,
      "amount": "",
      "pay_method": "",
      "remark": ""
    },
    "requiredGroupFields": []
  },
  "inventory": {
    "key": "inventory",
    "label": "库存",
    "desc": "数量累加写入库存表",
    "reviewLayout": "list",
    "includeSkuCode": true,
    "showSupplierField": false,
    "showSalesFields": false,
    "defaults": {
      "quantity": 1
    },
    "requiredGroupFields": []
  }
};

module.exports = { MODULES };

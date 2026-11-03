// China and Malabon warehouse addresses. Shared by the admin (shipping
// instructions, Ni Hao address book) and the public chat assistant, so the
// addresses live in one place.

export const warehouseNames = ["Guangzhou", "Yiwu", "Shishi", "Tongda Air Cargo", "Hong Kong"] as const;
export type WarehouseName = typeof warehouseNames[number];

/** Addresses exactly as supplied by Em (2026-11-02). Do not retype or "fix" the characters. */
export const warehouseAddresses: Record<WarehouseName, string> = {
  Shishi: `Shishi Branch Address 通达国际物流（石狮）
地址：福建省晋江市龙湖镇梧坑村逸海产业园4栋A1通达仓库（+客户唛头）
邮编：362200
联系人:张先生  13600719368; 0595-85293217
高德导航搜索“泉海通达物流”
Receiving Time: Monday to Sunday 8am to 6pm (except for holidays)`,
  Guangzhou: `Guangzhou Branch通达国际物流（广州）
地址：广州市白云区江高镇沙溪东路18号166通达仓库 （+客户唛头）
联系人：伍先生
联系电话：13924091288 / 13560372000
固定电话：020-81997500
邮编：510450
高德导航搜索“广州通达仓库”
Receiving Time: Monday to Sunday 8am to 6pm (except for holidays)`,
  Yiwu: `Yiwu Branch Address 通达国际物流（义乌）
浙江省义乌市苏溪镇好派路121号飞天制衣1楼通达仓库 （+客户唛头.）
联系人：13867932099（施先生）18069956177
0579-85201593
邮编322009
Receiving Time: Monday to Sunday 8am to 5pm (except for holidays)`,
  "Tongda Air Cargo": `TONGDA AIR CARGO 通达空运
贴标: AIR + 客户唛头
收件人：通达空运
地址：   福建泉州市晋江市龙湖梧坑逸海产业园4栋空运部 (+客户唛头)
手机号：   13533392699
1104931438@qq.com`,
  "Hong Kong": `HONGKONG WAREHOUSE
Wing Shung Fat Trading Company
"Pls Label ""TD+ABCD+MOBILE NO"""
香港新界葵涌贷柜码头路51-63号葵顺工业中心9楼E室
TELEPHONE NO.: (00852) 243-95566
CONTACT PERSON: Mr Wang Shixiong 王世雄 （00852）65127878
星期一至五，9點至6點，星期六．9點至2點
Monday to Friday, 9am to 6pm, Saturday, 9am to 2pm.`,
};

/** Malabon warehouse, exactly as supplied by Em (2026-11-02). */
export const malabonWarehouseAddress = `Tongda Malabon Warehouse Address
PIN: FSW COMMERCIAL WAREHOUSE RENTAL
Old 59, New 36 Rivera St Brgy Tañong Malabon City
(Color of Gate- Gray / Nearest Landmark McDonalds Rizal Ave)

Warehouse Operational Hours
7:00AM to 7:00PM
Monday to Saturday

Contact person: Alma / Elyza / Tiffany / Rhea/ Maylin
09175188335    09175188339

REMINDER: NEW POLICY
LONG VEHICLE WITH MORE THAN 16FEET LENGTH NOT ALLOWED DURING PEAK HOURS 9:00AM TO 4:00PM`;


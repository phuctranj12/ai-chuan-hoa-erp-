import { trayDimension } from "./tray-dimensions.js";
export const STANDARD_COLUMNS = ["Nhóm vật tư", "Vật tư", "Thông số kỹ thuật khác", "Kích thước", "Tiêu chuẩn", "Dải thông số kỹ thuật", "Kiểu lắp đặt", "Hoàn thiện", "Quy cách đóng gói", "Hãng sản xuất", "Xuất xứ", "Mã hiệu"];
export const ERP_CHECK_COLUMN = "Kiểm tra ERP";
const REQUIRED = ["Nhóm vật tư", "Vật tư", "Kích thước", "Dải thông số kỹ thuật", "Tiêu chuẩn", "Kiểu lắp đặt", "Hoàn thiện", "Thông số kỹ thuật khác", "Quy cách đóng gói"];
const FINISH_RULES = [["trong dán ngoài phủ nhôm","có keo có bạc"],["ngoài phủ nhôm","có bạc"]];

export function fold(value) { return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim(); }
const preserve = value => String(value ?? "").normalize("NFC").toLocaleLowerCase("vi").replace(/[^\p{L}\p{N}]+/gu," ").trim();
// Những từ này quyết định đúng loại vật tư nên không được phép bị cơ chế dò
// gần đúng đổi chéo. Đồng nghĩa nghiệp vụ được quy về cùng họ trước khi so.
const canonicalMaterialFold = value => {
  let source = fold(value).replace(/\bLOI\b/g,"CHECH")
    .replace(/\bONG\s+GHEN\b/g,"ONG LUON DAY")
    .replace(/\bGI\b/g,"THEP MA KEM");
  // "Co" chỉ là cách gọi cũ của Cút khi nó đứng ở đầu tên vật tư. Không
  // thay mọi chữ CO vì sẽ làm "Rắc co" biến thành cùng họ với Cút.
  source = source.replace(/^CO\b/,"CUT DAI");
  return source.replace(/\bY\s+90\b/g,"TE DEU");
};
const materialFamilyCache = new Map();
const protectedMaterialFamily = value => {
  const key = String(value ?? "");
  if (materialFamilyCache.has(key)) return materialFamilyCache.get(key);
  const source = canonicalMaterialFold(key), accented = preserve(key);
  let family = "";
  // Kép và Kẹp cùng thành KEP sau khi bỏ dấu. Phải khóa bằng chuỗi còn dấu
  // trước, nếu không phụ kiện ren có thể bị đổi thành kẹp C ống gió.
  if (/\bkép\b/u.test(accented)) family = "KEP_NOI_ONG";
  else if (/\bkẹp\s+c\b/u.test(accented)) family = "KEP_C";
  else if (/\blong đen vênh\b/u.test(accented)) family = "LONG_DEN_VENH";
  else if (/\blong đen phẳng\b/u.test(accented)) family = "LONG_DEN_PHANG";
  else if (/\bbăng dính\b/u.test(accented)) family = "BANG_DINH";
  else if (/\bkeo dán\b/u.test(accented)) family = "KEO_DAN";
  else if (/\bnắp chụp\b/u.test(accented)) family = "NAP_CHUP";
  else if (/\bnắp bể\b/u.test(accented)) family = "NAP_BE";
  else if (/\bY\s+LOC\b/.test(source)) family = "Y_LOC";
  else if (/\bVAN\s+CONG\b/.test(source)) family = "VAN_CONG";
  else if (/\bDONG\s+HO\s+NUOC\b/.test(source)) family = "DONG_HO_NUOC";
  else if (/\bKHOP\s+NOI\s+NHANH\b/.test(source)) family = "KHOP_NOI_NHANH";
  else if (/\bKHOP\s+NOI\s+MEM\b/.test(source)) family = "KHOP_NOI_MEM";
  else if (/\bHOP\s+CHIA\s+NGA\b/.test(source)) family = "HOP_CHIA_NGA";
  else if (/\bsơn màu\b/u.test(accented)) family = "SON_MAU";
  else if (/\bsơn lót\b/u.test(accented)) family = "SON_LOT";
  else if (/\bbích đặc\b/u.test(accented)) family = "BICH_DAC";
  else if (/\bbích\b/u.test(accented)) family = "BICH";
  else if (/\bONG\s+(?:(?:LUON(?:\s+DAY)?)\s+)?(?:MEM|RUOT\s+GA)\b.*\bPVC\b/.test(source)) family = "ONG_LUON_DAY_MEM_PVC";
  // Tên thương mại có thể dùng "ống luồn tròn", "ống luồn cứng" hoặc
  // chỉ "ống luồn dây". Đây đều là cùng họ ống luồn dây PVC cứng; không
  // được coi là ống nước uPVC hoặc họ ống thẳng chung.
  else if (/\bONG\s+LUON\b.*\bPVC\b/.test(source)) family = "ONG_LUON_DAY_PVC";
  else if (/\bONG\s+(?:(?:LUON(?:\s+DAY)?)\s+)?(?:MEM|RUOT\s+GA)\b.*\bTHEP\s+MA\s+KEM\b/.test(source)) family = "ONG_LUON_DAY_MEM_THEP_MA_KEM";
  else if (/\bONG\s+LUON\b.*\bTHEP\s+MA\s+KEM\b/.test(source)) family = "ONG_LUON_DAY_THEP_MA_KEM";
  else if (/\bTHANH\s+U(?:\d|\b)/.test(source)) family = "THANH_U";
  else if (/\bTHANH\s+V\b/.test(source)) family = "THANH_V";
  else if (/\bDAI\s+OM\b/.test(source)) {
    if (/\bGOI\s+DO\b/.test(source)) family = "DAI_OM_GOI_DO";
    else if (/\b2\s+NUA\b.*\bHAN\s+NOI\s+TY\b/.test(source)) family = "DAI_OM_2_NUA_HAN_NOI_TY";
    else if (/\b2\s+NUA\b/.test(source)) family = "DAI_OM_2_NUA";
    else if (/\bNGAN\b/.test(source)) family = "DAI_OM_NGAN";
    else if (/\bTON\b/.test(source)) family = "DAI_OM_TON";
    else family = "DAI_OM";
  }
  else if (/\bGIOANG\s+ONG\s+GIO\b/.test(source)) {
    const material = /\bBONG\s+THUY\s+TINH\b/.test(source) ? "BONG_THUY_TINH"
      : /\bCAO\s+SU\b/.test(source) ? "CAO_SU"
        : /\bNHUA\s+XOP\b/.test(source) ? "NHUA_XOP" : "";
    const fire = /\bKHONG\s+CHONG\s+CHAY\b/.test(source) ? "KHONG_CHONG_CHAY"
      : /\bCHONG\s+CHAY\b/.test(source) ? "CHONG_CHAY" : "";
    family = `GIOANG_ONG_GIO_${material}_${fire}`;
  }
  else if (/\bTHONG\s+TAC\b/.test(source)) family = "THONG_TAC";
  else if (/\bY\s+DEU\b/.test(source)) family = "Y_DEU";
  else if (/\bY\s+(?:THU|GIAM)\b/.test(source)) family = "Y_THU";
  else if (/\bY\b/.test(source) && !/\bY\s+LOC\b/.test(source)) family = "Y";
  else if (/\bTE\s+CONG\s+DEU\b/.test(source)) family = "TE_CONG_DEU";
  else if (/\bTE\s+CONG\s+(?:THU|GIAM)\b/.test(source)) family = "TE_CONG_THU";
  else if (/\bCON\s+REN\s+TRONG\b/.test(source)) family = "CON_REN_TRONG";
  else if (/\bMANG\s+SONG\s+REN\s+TRONG\b/.test(source)) family = "MANG_SONG_REN_TRONG";
  else if (/\bRAC\s+CO\b/.test(source)) family = "RAC_CO";
  else if (/\bCHECH\s+REN\s+TRONG\b/.test(source)) family = "CHECH_REN_TRONG";
  else if (/\bCUT\s+REN\s+TRONG\b/.test(source)) family = "CUT_REN_TRONG";
  else if (/\bCUT\s+REN\s+NGOAI\b/.test(source)) family = "CUT_REN_NGOAI";
  else if (/\bTE\s+DEU\b/.test(source)) family = "TE_DEU";
  else if (/\bTE\s+(?:THU|GIAM)\b/.test(source)) family = "TE_THU";
  else if (/\bCON\b/.test(source)) family = "CON";
  else if (/^ONG\b/.test(source) && !/\b(?:CUT|CHECH|TE|Y|CON|BICH|MANG SONG|NAP BIT|NUT BIT|RAC CO|KEP)\b/.test(source)) family = "ONG_THANG";
  else if (/\bNAP\b.*\bPHU KIEN\b.*\bCHU Z\b/.test(source)) family = "NAP_PHU_KIEN_CHU_Z";
  else if (/\bPHU KIEN\b.*\bCHU Z\b/.test(source)) family = "PHU_KIEN_CHU_Z";
  else if (/\bNAP BIT\b/.test(source)) family = "NAP_BIT";
  else if (/\bNUT BIT\b/.test(source)) family = "NUT_BIT";
  else if (/\bNAP\b/.test(source) && /\bCUT\b/.test(source)) family = "NAP_CUT";
  else if (/\bNAP\b/.test(source) && /\bTE\b/.test(source)) family = "NAP_TE";
  else if (/\bNAP\b/.test(source) && /\bTU CHAC\b/.test(source)) family = "NAP_TU_CHAC";
  else if (/\bNAP\b/.test(source) && /\bCON\b/.test(source)) family = "NAP_CON";
  else if (/\bNAP\b/.test(source)) family = "NAP";
  else if (/\bCHECH\b/.test(source)) family = "CHECH";
  else if (/\bCUT\b/.test(source)) family = "CUT";
  else if (/\bTE\b/.test(source)) family = "TE";
  materialFamilyCache.set(key,family);
  return family;
};
const compatibleMaterial = (source, candidate) => {
  const expected = protectedMaterialFamily(source);
  if (!expected) return true;
  const actual = protectedMaterialFamily(candidate);
  if (expected === "Y") return actual === "Y" || actual === "Y_DEU" || actual === "Y_THU";
  if (expected === "TE") return actual === "TE" || actual === "TE_DEU" || actual === "TE_THU" || actual === "TE_CONG_DEU" || actual === "TE_CONG_THU" || actual === "THONG_TAC";
  if (expected === "Y_DEU" || expected === "Y_THU") return actual === expected || actual === "Y";
  if (["TE_DEU","TE_THU","TE_CONG_DEU","TE_CONG_THU"].includes(expected)) return actual === expected || actual === "TE";
  return actual === expected;
};
// Vật liệu là điều kiện loại trừ, không chỉ là một từ dùng để cộng điểm.
// Cho phép mô tả trung tính (không có vật liệu), nhưng khi cả hai phía đều
// nêu vật liệu thì phải có ít nhất một vật liệu tương thích.
const sourceMaterialCache = new Map();
const sourceMaterials = value => {
  const key = String(value ?? "");
  if (sourceMaterialCache.has(key)) return sourceMaterialCache.get(key);
  const text = fold(key), result = new Set();
  const inox = text.match(/\bINOX(?:\s+(201|304|316|316L|430))?\b/);
  if (inox) result.add(inox[1] ? `INOX${inox[1]}` : "INOX");
  if (/\bHDPE(?:\s*100)?\b/.test(text)) result.add("HDPE");
  if (/\bPPR\b/.test(text)) result.add("PPR");
  if (/\bUPVC\b/.test(text)) result.add("UPVC");
  if (/\bCPVC\b/.test(text)) result.add("CPVC");
  if (/\bPVC\b/.test(text)) result.add("PVC");
  if (/\bTHEP DEN\b/.test(text)) result.add("THEP_DEN");
  if (/\bTHEP (?:MA|TRANG) KEM\b/.test(text)) result.add("THEP_MA_KEM");
  if (/\bGI\b/.test(text)) result.add("THEP_MA_KEM");
  if (/\bGANG\b/.test(text)) result.add("GANG");
  const materials = [...result];
  sourceMaterialCache.set(key,materials);
  return materials;
};
// Không tự đổi cấp inox. INOX 201/304/316 là các vật liệu khác nhau; khi
// ERP chỉ có tên "inox" chung thì kết quả phải để người dùng kiểm tra thay
// vì âm thầm nâng/hạ cấp vật liệu.
const sameSourceMaterial = (left, right) => left === right;
const compatibleSourceMaterial = (source, candidate) => {
  const expected = sourceMaterials(source), actual = sourceMaterials(candidate);
  return !expected.length || !actual.length || expected.some(left => actual.some(right => sameSourceMaterial(left,right)));
};
const electricalDomainCache = new Map();
const electricalDomain = value => {
  const cacheKey = String(value ?? "");
  if (electricalDomainCache.has(cacheKey)) return electricalDomainCache.get(cacheKey);
  const text = fold(value);
  let result = "";
  // "thang cáp" và "máng cáp" là hệ giá đỡ, không phải dây/cáp điện.
  // Phải loại trừ hai cụm này trước quy tắc CAP tổng quát bên dưới.
  if (/\b(?:THANG|MANG)\s+CAP\b/.test(text)) result = "";
  else if (/\bONG\s+(?:LUON|GHEN)\b/.test(text)) result = "CONDUIT";
  else if (/\bCAP\s+TIN HIEU\b|\bDAY\s+CAP\s+DIEN\s+NHE\b|\bCAP\s+CAT\s*(?:3|5E|6|6A|7|8)\b/.test(text)) result = "SIGNAL_CABLE";
  else if (/\bCAP\b|\bDAY\s+DIEN\b|\bDAY\s+CAP\s+DIEN\b/.test(text) || /\bCU\s+PVC(?:\s+PVC)?\b/.test(text)) result = "POWER_CABLE";
  electricalDomainCache.set(cacheKey,result);
  return result;
};
const compatibleElectricalDomain = (source, candidate) => {
  const expected = electricalDomain(source), actual = electricalDomain(candidate);
  if (!expected || !actual) return true;
  if (expected === "CONDUIT") return actual === "CONDUIT";
  if (expected === "SIGNAL_CABLE") return actual !== "CONDUIT";
  return actual === "POWER_CABLE";
};
const explicitElectricalMaterial = value => {
  const text = String(value ?? "").normalize("NFC");
  // Ưu tiên cấu tạo dài trước để các lớp cách điện/vỏ không bị rút gọn
  // thành Cu/PVC chỉ vì cùng chứa hai thành phần Cu và PVC.
  if (/\bCu\s*\/\s*XLPE\s*\/\s*PVC(?!\s*\/)/iu.test(text)) return "Cáp điện Cu/XLPE/PVC";
  if (/\bCu\s*\/\s*PVC\s*\/\s*PVC(?!\s*\/)/iu.test(text)) return "Cáp điện Cu/PVC/PVC";
  if (/\bCu\s*\/\s*PVC(?!\s*\/)/iu.test(text)) return "Dây điện Cu/PVC";
  return "";
};
const explicitBusinessMaterial = value => {
  const source = fold(value);
  const electrical = explicitElectricalMaterial(value);
  if (electrical) return electrical;
  if (/\bTS\s+DONG\s+HO\s+NUOC\b/.test(source)) return "TS_Đồng hồ nước";
  if (/\bDONG\s+HO\s+NUOC\b/.test(source)) return "Đồng hồ nước";
  if (/\bVAN\s+CONG\b/.test(source)) {
    if (/\bPPR\b/.test(source)) return "Van cổng PPR";
    if (/\bUPVC\b/.test(source)) return "Van cổng uPVC";
    return "Van cổng";
  }
  if (/\bY\s+LOC\b/.test(source)) return "Y lọc";
  if (/\bKHOP\s+NOI\s+MEM\s+PVC\b/.test(source)) return "Khớp nối mềm PVC";
  if (/\bKHOP\s+NOI\s+MEM\b/.test(source)) return "Khớp nối mềm";
  if (/\bKHOP\s+NOI\s+NHANH\b.*\bINOX\s+304\b/.test(source)) return "Khớp nối nhanh inox 304";
  if (/\bKHOP\s+NOI\s+NHANH\b.*\bINOX\s+316\b/.test(source)) return "Khớp nối nhanh inox 316";
  if (/\bONG\s+(?:GHEN|LUON(?:\s+DAY)?)\b.*\b(?:MEM|RUOT\s+GA)\b.*\bPVC\b/.test(source)) return "Ống luồn dây mềm PVC";
  if (/\bONG\s+(?:GHEN|LUON)\b.*\bPVC\b/.test(source)) return "Ống luồn dây PVC";
  if (/\bONG\s+(?:GHEN|LUON(?:\s+DAY)?)\b.*\b(?:MEM|RUOT\s+GA)\b.*\bGI\b/.test(source)) return "Ống luồn dây mềm thép mạ kẽm";
  if (/\bKHOP\s+NOI\s+REN\s+PVC\b/.test(source)) return "Khớp nối ren PVC";
  if (/\bBANG\s+DINH\s+DUC\b/.test(source)) return "Băng dính đục";
  if (/\bBANG\s+DINH\s+GIAY\b/.test(source)) return "Băng dính giấy";
  if (/\bBANG\s+DINH\s+TRONG\b/.test(source)) return "Băng dính trong";
  if (/\bKE\s+GOC\s+GIA\s+DO\s+2\s+TANG\s+U\s*22\b/.test(source)) {
    if (/\bMA\s+KEM\s+NHUNG\s+NONG\b/.test(source)) return "Ke góc giá đỡ 2 tầng U22 mạ kẽm nhúng nóng";
    if (/\bMA\s+DIEN\b/.test(source)) return "Ke góc giá đỡ 2 tầng U22 mạ điện";
  }
  if (/\bECU\s+CAI\b/.test(source)) return "Ecu cài";
  if (/\bLONG\s+DEN\s+VENH\b.*\bMA\s+KEM\s+NHUNG\s+NONG\b/.test(source)) return "Long đen vênh mạ kẽm nhúng nóng";
  if (/\bLONG\s+DEN\s+PHANG\b.*\bMA\s+KEM\s+NHUNG\s+NONG\b/.test(source)) return "Long đen phẳng mạ kẽm nhúng nóng";
  if (/\bBANG\s+DINH\b.*\bBAO\s+ON\b/.test(source)) return "Băng dính bảo ôn";
  if (/\bKEO\s+DAN\s+ONG\b.*\b(?:PVC|UPVC)\b/.test(source)) return "Keo dán ống PVC/uPVC";
  if (/\bONG\s+BAO\s+ON\s+CAO\s+SU\s+XOP\b/.test(source)) return "Ống bảo ôn cao su xốp";
  if (/\bONG\s+LONG\s+DAU\s+CO(?:S|T)\b/.test(source)) return "Ống lồng đầu cốt";
  if (/\bNAP\s+CHUP\b.*\bNHUA\b.*\bU\s*\d+\b/.test(source)) return "Nắp chụp thanh U";
  if (/^ONG\b.*\bUPVC\b/.test(source) && !/\b(?:CUT|CHECH|TE|Y|CON|BICH|MANG SONG|NAP BIT|NUT BIT)\b/.test(source)) return "Ống uPVC";
  // Nhiều BOQ/NCC chỉ ghi "Ống thép đen" mà không ghi công nghệ hàn.
  // Trong đúng họ ống thẳng, ERP dùng tên "Ống hàn thép đen". Khóa các
  // tên phụ kiện để quy tắc này không đổi Cút/Tê/Côn/Bích thành Ống.
  if (/^ONG\b.*\bTHEP\s+DEN\b/.test(source)
    && !/\b(?:CUT|CHECH|TE|Y|CON|BICH|MANG SONG|KEP|RAC CO|NAP|NUT|VAN)\b/.test(source)) return "Ống hàn thép đen";
  // Tương tự, nguồn thường ghi "Ống thép tráng kẽm" mà bỏ chữ "hàn".
  // Chỉ áp dụng cho ống thẳng để không nuốt tên các phụ kiện cùng vật liệu.
  if (/^ONG\b.*\bTHEP\s+(?:TRANG|MA)\s+KEM\b/.test(source)
    && !/\b(?:CUT|CHECH|TE|Y|CON|BICH|MANG SONG|KEP|RAC CO|NAP|NUT|VAN)\b/.test(source)) return "Ống hàn thép mạ kẽm";
  // Nhà cung cấp hay rút gọn "Tê ren trong, thép tráng kẽm" thành
  // "Tê ren trắng/tráng kẽm". Một đường kính là Tê đều; hai đường kính
  // là Tê thu, nhất quán với nguyên tắc Tê/Y của các Nhóm ống.
  if (/\bTE\s+REN\b.*\b(?:THEP\s+)?(?:TRANG|MA)\s+KEM\b/.test(source)) {
    const hasTwoDiameters = /(?:DN|D)?\s*\d+(?:[.,]\d+)?\s*[xX×\/-]\s*(?:DN|D)?\s*\d+(?:[.,]\d+)?/i.test(String(value ?? ""));
    return hasTwoDiameters ? "Tê thu ren trong thép mạ kẽm" : "Tê đều ren trong thép mạ kẽm";
  }
  if (/\bONG\s+THEP\s+MA\s+TRON\b/.test(source)) return "Ống hàn thép mạ kẽm";
  if (/\bONG\s+HAN\b.*\bTHEP\s+(?:TRANG|MA)\s+KEM\b/.test(source)) return "Ống hàn thép mạ kẽm";
  if (/\bCUT\s+DAI\b.*\bTHEP\s+(?:TRANG|MA)\s+KEM\b/.test(source)) return "Cút dài thép mạ kẽm";
  if (/\bCUT\s+REN\s+TRONG\b.*\bTHEP\s+(?:TRANG|MA)\s+KEM\b/.test(source)) return "Cút ren trong thép mạ kẽm";
  if (/\bTE\s+DEU\s+REN\s+TRONG\b.*\bTHEP\s+(?:TRANG|MA)\s+KEM\b/.test(source)) return "Tê đều ren trong thép mạ kẽm";
  if (/\bTE\s+THU\s+REN\s+TRONG\b.*\bTHEP\s+(?:TRANG|MA)\s+KEM\b/.test(source)) return "Tê thu ren trong thép mạ kẽm";
  if (/\bTE\s+(?:THU|GIAM)\b.*\bTHEP\s+(?:TRANG|MA)\s+KEM\b/.test(source)) return "Tê thu thép mạ kẽm";
  if (/\bTE\s+DEU\b.*\bTHEP\s+(?:TRANG|MA)\s+KEM\b/.test(source)) return "Tê đều thép mạ kẽm";
  if (/\bCON\s+REN\s+TRONG\b.*\bTHEP\s+(?:TRANG|MA)\s+KEM\b/.test(source)) return "Côn ren trong thép mạ kẽm";
  if (/\bCON\b.*\bTHEP\s+(?:TRANG|MA)\s+KEM\b/.test(source)) return "Côn thép mạ kẽm";
  if (/\bCHECH\s+REN\s+TRONG\b.*\bTHEP\s+(?:TRANG|MA)\s+KEM\b/.test(source)) return "Chếch ren trong thép mạ kẽm";
  if (/\bCHECH\b.*\bTHEP\s+(?:TRANG|MA)\s+KEM\b/.test(source)) return "Chếch thép mạ kẽm";
  if (/\bMANG\s+SONG\s+REN\s+TRONG\b.*\bTHEP\s+(?:TRANG|MA)\s+KEM\b/.test(source)) return "Măng sông ren trong thép mạ kẽm";
  if (/\bKEP\b.*\bTHEP\s+(?:TRANG|MA)\s+KEM\b/.test(source)) return "Kép thép mạ kẽm";
  if (/\bRAC\s+CO\b.*\bTHEP\s+(?:TRANG|MA)\s+KEM\b/.test(source)) return "Rắc co thép mạ kẽm";
  if (/\bBICH\s+DAC\b.*\bTHEP\s+(?:TRANG|MA)\s+KEM\b/.test(source)) return "Bích đặc thép mạ kẽm";
  if (/\bBICH\b.*\bTHEP\s+(?:TRANG|MA)\s+KEM\b/.test(source)) return "Bích thép mạ kẽm";
  if (/\bBICH\s+DAC\b.*\bTHEP\s+DEN\b/.test(source)) return "Bích đặc thép đen";
  if (/\bBICH\b.*\bTHEP\s+DEN\b/.test(source)) return "Bích thép đen";
  if (/\bCON\b.*\bTHEP\s+DEN\b/.test(source)) return "Côn thép đen";
  const zinc = source.match(/\bZ\s*(18|27|80|120|180|275)\b/)?.[1];
  if (zinc && /\bONG\s+GIO\b.*\bTON\s+(?:TRANG|MA)\s+KEM\b/.test(source)) {
    const grade = zinc === "18" ? "180" : zinc === "27" ? "275" : zinc;
    return /\bPHU\s+KIEN\s+ONG\s+GIO\b/.test(source)
      ? `Phụ kiện ống gió tôn mạ kẽm Z${grade}` : `Ống gió tôn mạ kẽm Z${grade}`;
  }
  if (/\bCAP\s+CAT\s*6\b/.test(source)) return "Cáp CAT6";
  if (/\bONG\s+(?:LUON\s+DAY\s+)?(?:MEM|RUOT\s+GA)\b.*\bPVC\b/.test(source)) return "Ống luồn dây mềm PVC";
  if (/\bTHANH\s+U(?:\d|\b)/.test(source) && /\bMA\s+KEM\s+NHUNG\s+NONG\b/.test(source)) return "Thanh U mạ kẽm nhúng nóng";
  if (/\bTHANH\s+U(?:\d|\b)/.test(source) && /\bMA\s+DIEN\b/.test(source)) return "Thanh U mạ điện";
  if (/\bTHANH\s+V\b/.test(source) && /\bMA\s+DIEN\b/.test(source)) {
    return /\bDOT\s+LO\b/.test(source) && !/\bKHONG\s+DOT\s+LO\b/.test(source)
      ? "Thanh V đột lỗ mạ điện" : "Thanh V mạ điện";
  }
  if (/\bDAI\s+OM\b/.test(source) && /\bMA\s+DIEN\b/.test(source)) {
    if (/\bGOI\s+DO\b/.test(source)) return "Đai ôm gối đỡ mạ điện";
    if (!/\b(?:2\s+NUA|NGAN|TON)\b/.test(source)) return "Đai ôm mạ điện";
  }
  if (/\bBULONG\s+DAU\s+LUC\s+GIAC\b/.test(source)) {
    if (/\bINOX\s+304\b/.test(source)) return "Bulong đầu lục giác inox 304";
    if (/\bMA\s+DIEN\b/.test(source)) return "Bulong đầu lục giác mạ điện";
  }
  if (/\bNO\s+RUT\b.*\bINOX\s+304\b/.test(source)) return "Nở rút inox 304";
  if (/\bTY\s+REN\b.*\bINOX\s+304\b/.test(source)) return "Ty ren inox 304";
  if (/\bUBOLT\b.*\bINOX\s+304\b/.test(source)) return "Ubolt inox 304";
  if (/\bTAI\s+TREO\s+ONG\s+GIO\b/.test(source)) return "Tai treo hộp gió";
  if (/\bGIOANG\s+ONG\s+GIO\b/.test(source)) {
    const material = /\bBONG\s+THUY\s+TINH\b/.test(source) ? "bông thủy tinh"
      : /\bCAO\s+SU\b/.test(source) ? "cao su"
        : /\bNHUA\s+XOP\b/.test(source) ? "nhựa xốp" : "";
    if (material) {
      const fire = /\bKHONG\s+CHONG\s+CHAY\b/.test(source) ? " không chống cháy"
        : /\bCHONG\s+CHAY\b/.test(source) ? " chống cháy" : "";
      return `Gioăng ống gió ${material}${fire}`;
    }
  }
  return "";
};
const explicitBusinessGroup = value => {
  const source = fold(value);
  if (/\bTS\s+DONG\s+HO\s+NUOC\b/.test(source)) return "TS_Thiết bị đo";
  if (/\bDONG\s+HO\s+NUOC\b/.test(source)) return "Van nước";
  if (/\b(?:VAN\s+CONG|Y\s+LOC|KHOP\s+NOI\s+MEM)\b/.test(source) && !/\b(?:PPR|UPVC|PVC)\b/.test(source)) return "Van nước";
  if (/\bKHOP\s+NOI\s+NHANH\b.*\bINOX\s+304\b/.test(source)) return "Nối nhanh inox 304";
  if (/\bKHOP\s+NOI\s+NHANH\b.*\bINOX\s+316\b/.test(source)) return "Nối nhanh inox 316";
  const conduitPhrase = /\b(?:ONG\s+(?:GHEN|LUON)|HOP\s+CHIA\s+NGA|KHOP\s+NOI\s+REN|CUT\s+ONG|KEP\s+ONG)\b/;
  if (conduitPhrase.test(source) && /\bPVC\b/.test(source)) return "Ống luồn dây PVC & phụ kiện";
  if (conduitPhrase.test(source) && /\bGI\b/.test(source)) return "Ống luồn dây thép mạ kẽm & phụ kiện";
  if (/\bBANG\s+DINH\b/.test(source) || /\bKE\s+GOC\s+GIA\s+DO\b/.test(source) || /\bSON\s+(?:MAU|LOT)\b/.test(source)) return "Vật tư phụ";
  if (/\bTHEP\s+(?:TRANG|MA)\s+KEM\b/.test(source)) return "Ống thép mạ kẽm & phụ kiện";
  if (/\bONG\s+THEP\s+MA\s+TRON\b/.test(source)) return "Ống thép mạ kẽm & phụ kiện";
  if (/\bTHEP\s+DEN\b/.test(source) && /\b(?:ONG|CUT|CHECH|TE|CON|BICH|MANG SONG|KEP|RAC CO)\b/.test(source)) return "Ống thép đen & phụ kiện";
  if (/\bTHANH\s+U(?:\d|\b)/.test(source)) return "Vật tư phụ";
  if (/^ONG\b.*\bUPVC\b/.test(source)) return "Ống uPVC & phụ kiện";
  return "";
};
const ambiguousBusinessMaterial = value => {
  const source = fold(value);
  if (/\bKHOP\s+NOI\s+NHANH\b.*\bINOX\b/.test(source) && !/\bINOX\s+(?:304|316)\b/.test(source)) return true;
  if (/\bHOP\s+CHIA\s+NGA\b/.test(source) && !/\b(?:1|2|3|4)\s+(?:NGA|DUONG)\b/.test(source)) return true;
  if (/\bONG\s+GHEN\s+CUNG\b.*\bGI\b/.test(source) && !/\b(?:DAU\s+REN|DAU\s+TRON|EMT|IMC|RSC)\b/.test(source)) return true;
  if (/\bCUT\s+ONG\s+GI\b/.test(source) && !/\b(?:CO\s+NAP|KHONG\s+NAP|DAU\s+REN|DAU\s+TRON)\b/.test(source)) return true;
  if (/\bKEP\s+ONG\s+GI\b/.test(source) && !/\b(?:CO\s+DE|KHONG\s+DE)\b/.test(source)) return true;
  return false;
};
const compatibleMatrixRow = (source, row) => compatibleMaterial(source,cell(row || {},"Vật tư"))
  && compatibleSourceMaterial(source,`${cell(row || {},"Nhóm vật tư")} ${cell(row || {},"Vật tư")}`)
  && compatibleElectricalDomain(source,`${cell(row || {},"Nhóm vật tư")} ${cell(row || {},"Vật tư")}`);
const DIMENSION_NUMBER = "(\\d+(?:[.,]\\d+)?)";
const PIPE_D_GROUPS = new Set([
  "ONG UPVC PHU KIEN",
  "ONG HDPE HAN NHIET PHU KIEN",
  "ONG HDPE HAN DIEN CUC PHU KIEN",
]);
const normalizeDimensionNumber = value => {
  const normalized = String(value ?? "").replace(",",".");
  return /^\d+\.\d+$/.test(normalized) ? normalized.replace(/0+$/,"").replace(/\.$/,"") : normalized;
};
const steelPipeTriple = (text, group = "", material = "") => {
  const context = fold(`${group} ${material}`);
  if (!/\bONG\b/.test(context) || !/\b(?:THEP|INOX)\b/.test(context)) return null;
  const match = String(text ?? "").match(/(?:^|[^\d.,])(\d+(?:[.,]\d+)?)\s*[xX×]\s*(\d+(?:[.,]\d+)?)\s*[xX×]\s*(\d+(?:[.,]\d+)?)(?=$|[^\d.,])/);
  return match ? {
    outside:Number(match[1].replace(",",".")),
    thickness:normalizeDimensionNumber(match[2]),
    length:Number(match[3].replace(",",".")),
  } : null;
};
const defaultPackaging = (material, dimension = "") => {
  const key = fold(material);
  if (key === "ONG NUOC LANH PPR" || key === "ONG NUOC NONG PPR" || key === "ONG UPVC") return "cây 4m";
  if (key === "ONG LUON DAY PVC") return "cây 2.92m";
  if (key === "ONG LUON DAY MEM PVC") {
    const nominal = Number(String(dimension ?? "").match(/\d+(?:[.,]\d+)?/)?.[0]?.replace(",","."));
    if (nominal === 20) return "cuộn 50m";
    if (nominal === 25) return "cuộn 40m";
    if (nominal >= 32) return "cuộn 25m";
    return "";
  }
  if (/^ONG\s+GIO\s+MEM\b/.test(key)) return "cuộn 8m";
  if (/^ONG\b.*\b(?:THEP|INOX)\b/.test(key)) return "cây 6m";
  return "";
};
const sourceInstallType = text => {
  const source = fold(text);
  if (/\bBICH\s+TDC\b/.test(source)) return "bích TDC";
  if (/\bKEP\s+C\b/.test(source)) return "kẹp C";
  if (/\bREN\b/.test(source)) return "ren";
  return "";
};
const pipeDimensionPrefix = group => PIPE_D_GROUPS.has(fold(group)) ? "D" : "DN";
const sourceStandardValue = (text, group = "") => {
  const source = String(text ?? "");
  // Không dùng \b cho tên tiêu chuẩn: JavaScript coi ký tự tiếng Việt là
  // non-word, khiến "EN" trong "đen" bị nhận nhầm là tiêu chuẩn EN.
  const boundary = "(?:^|[^\\p{L}\\p{N}])";
  const compound = source.match(new RegExp(`${boundary}DIN\\s*[- ]?\\s*EN\\s*[- ]?\\s*(\\d+(?:(?:-|:)\\s*\\d+)*)`,"iu"));
  if (compound) return `DIN EN ${compound[1].replace(/\s+/g,"")}`;
  const detailed = source.match(new RegExp(`${boundary}((?:ANSI|ASME|ISO|JIS|ASTM|BS|EN|DIN|TCVN|IEC)\\s*(?:[A-Z]\\s*)?\\d+(?:(?:[-:.])\\s*\\d+)*)`,"iu"));
  if (detailed) return detailed[1].replace(/\s+/g," ").trim()
    .replace(/^((?:ANSI|ASME|ISO|JIS|ASTM|BS|EN|DIN|TCVN|IEC))(?=\d)/i,"$1 ");
  const bare = source.match(new RegExp(`${boundary}(ANSI|ASME|ASTM|BS|EN|DIN|ISO|IEC|JIS|TCVN)(?=$|[^\\p{L}\\p{N}])`,"iu"))?.[1]?.toUpperCase() || "";
  if (bare === "ISO" && fold(group).includes("ONG UPVC")) return "ISO 1452";
  return bare;
};
const PIPE_THREAD_INCH_TO_DN = new Map([
  ["1/2","15"],
  ["3/4","20"],
  ["1","25"],
  ["1 1/4","32"],
  ["1 1/2","40"],
  ["2","50"],
]);
const threadedPipeDimension = (text, group, material = "") => {
  const source = String(text ?? "");
  const context = fold(`${group} ${material} ${source}`);
  if (!context.includes("PPR") || !context.includes("REN")) return null;
  // Phụ kiện ren thường ghi đường kính ống hệ mét ở vế đầu và ren inch ở
  // vế sau: D32x1", DN25x3/4", 32x1-1/4"... Nhà cung cấp có thể
  // bỏ dấu inch với phân số quen thuộc như D20x1/2.
  const match = source.match(/(?:DN|D)?\s*(\d+(?:[.,]\d+)?)\s*[xX×]\s*((?:\d+\s*[- ]\s*)?\d+\s*\/\s*\d+|\d+)\s*(["”]|INCH\b)?/i);
  if (!match) return null;
  if (!match[3] && !match[2].includes("/")) return null;
  const inchKey = match[2]
    .replace(/\s*\/\s*/g,"/")
    .replace(/(\d)\s*-\s*(?=\d+\/)/g,"$1 ")
    .replace(/\s+/g," ")
    .trim();
  const threadDn = PIPE_THREAD_INCH_TO_DN.get(inchKey);
  if (!threadDn) return null;
  return `${pipeDimensionPrefix(group)}${normalizeDimensionNumber(match[1])}x${threadDn}`;
};
const pipeDiameterValues = text => {
  const source = String(text ?? "");
  const number = "(\\d+(?:[.,]\\d+)?)";
  // Cặp đường kính có thể viết 32x25, D32/25, DN32-DN25... Chỉ lấy
  // tối đa hai đường kính; PN, góc, chiều dài và chiều dày không tham gia.
  const pair = source.match(new RegExp(
    `(?:DN|D|PHI|Ø)?\\s*${number}\\s*[-xX×\\/]\\s*(?:DN|D|PHI|Ø)?\\s*${number}(?!\\s*(?:MM)?\\s*(?:2|²))`,
    "i",
  ));
  if (pair) return [normalizeDimensionNumber(pair[1]),normalizeDimensionNumber(pair[2])];
  const explicit = source.match(/\b(?:DN|D|PHI)\s*(\d+(?:[.,]\d+)?)\b|Ø\s*(\d+(?:[.,]\d+)?)/i);
  if (explicit) return [normalizeDimensionNumber(explicit[1] || explicit[2])];
  // Chỉ nhận số trần khi nó đứng sau tên hệ ống. Nhờ vậy PN10, 90 độ,
  // T0.8, L6000 hoặc kích thước ren không bị lấy nhầm làm đường kính.
  const bare = source.match(/\b(?:PPR|UPVC|CPVC|HDPE|PEX|PP|DB20)\b\s*(?:(?:PN|SDR)\s*\d+(?:[.,]\d+)?\s*)?(\d+(?:[.,]\d+)?)(?!\s*(?:°|DO\b|MM\s*(?:2|²)))/i);
  return bare ? [normalizeDimensionNumber(bare[1])] : [];
};
const sharedTrayDimensions = text => {
  const source = String(text ?? "");
  const match = source.match(/\bW\s*(\d+(?:[.,]\d+)?)((?:\s*[xX×\/]\s*(?:W\s*)?\d+(?:[.,]\d+)?){1,3})\s*[xX×]\s*H\s*(\d+(?:[.,]\d+)?)/i);
  if (!match) return null;
  const widths = [match[1],...[...match[2].matchAll(/\d+(?:[.,]\d+)?/g)].map(item => item[0])]
    .map(normalizeDimensionNumber);
  return {widths,height:normalizeDimensionNumber(match[3])};
};
const labelledDimensionValues = text => {
  const values = {W:[],H:[],Z:[]};
  // Không dùng \b vì H/Z thường đứng ngay sau ký tự phân cách x (W300xH100xZ50).
  for (const match of String(text).matchAll(/([WHZ])\s*(\d+(?:[.,]\d+)?)/gi)) values[match[1].toUpperCase()].push(match[2]);
  return values;
};
const materialDimensionRule = (text, group, material) => {
  const groupKey = fold(group), materialKey = canonicalMaterialFold(material), words = ` ${materialKey} `;
  const has = term => words.includes(` ${term} `);
  const pipeGroup = groupKey === "ONG" || groupKey.startsWith("ONG ");
  const trayGroup = groupKey === "THANG" || groupKey.startsWith("THANG ") || groupKey === "MANG PHU KIEN" || groupKey.startsWith("MANG PHU KIEN ");

  if (pipeGroup) {
    // Ống gió tôn chữ nhật dùng WxH. Chỉ áp dụng D/DN khi mô tả của nhóm
    // này ghi rõ một ký hiệu đường kính tròn.
    if (groupKey.includes("ONG GIO TON") && !/(?:\bDN\s*\d|\bD\s*\d|\bPHI\s*\d|Ø\s*\d)/i.test(String(text))) return null;
    const threadedDimension = threadedPipeDimension(text,group,material);
    if (threadedDimension) return {value:threadedDimension,trusted:true,enforced:true};
    const diameterValues = pipeDiameterValues(text);
    const twoDiameters = has("CON") || (has("TE") && has("THU")) || (has("Y") && has("THU"));
    const explicitlyEven = has("DEU");
    const oneDiameter = has("MANG SONG") || (has("TE") && !has("THU")) || has("Y DEU") || has("NAP BIT") || has("NUT BIT") || has("CUT") || has("CHECH");
    // Cả ống thẳng và các phụ kiện khác cũng phải đi qua quy tắc Nhóm để
    // D/DN trong mô tả hoặc Alias cũ không ghi đè lại kết quả chuẩn.
    if (!twoDiameters && !oneDiameter && !diameterValues.length) return null;
    const prefix = pipeDimensionPrefix(group);
    if (twoDiameters) {
      if (diameterValues.length >= 2) return {value:`${prefix}${diameterValues[0]}x${diameterValues[1]}`,trusted:true,enforced:true};
      return {value:diameterValues[0] ? `${prefix}${diameterValues[0]}` : "",trusted:false,enforced:true};
    }
    if (explicitlyEven && diameterValues.length >= 2 && diameterValues.every(value => value === diameterValues[0])) {
      return {value:`${prefix}${diameterValues[0]}`,trusted:true,enforced:true};
    }
    const first = diameterValues[0] || "";
    return {value:first ? `${prefix}${first}` : "",trusted:!!first,enforced:true};
  }

  if (!trayGroup) return null;
  const catalogRule = trayDimension(text, group, material);
  if (catalogRule) return catalogRule;
  const dimensions = labelledDimensionValues(text), width = dimensions.W[0] || "", height = dimensions.H[0] || "", zAxis = dimensions.Z[0] || "";
  const shared = sharedTrayDimensions(text);
  const widthPair = String(text).match(new RegExp(`\\bW\\s*${DIMENSION_NUMBER}\\s*\\/\\s*(?:W\\s*)?${DIMENSION_NUMBER}\\b`,"i"));
  const sharedHeightPair = String(text).match(new RegExp(
    `\\bW\\s*${DIMENSION_NUMBER}\\s*\\/\\s*(?:W\\s*)?${DIMENSION_NUMBER}\\s*[xX×]\\s*H\\s*${DIMENSION_NUMBER}\\b`,
    "i",
  ));
  const sharedHeightTriple = String(text).match(new RegExp(
    `\\bW\\s*${DIMENSION_NUMBER}\\s*\\/\\s*(?:W\\s*)?${DIMENSION_NUMBER}\\s*\\/\\s*(?:W\\s*)?${DIMENSION_NUMBER}\\s*[xX×]\\s*H\\s*${DIMENSION_NUMBER}\\b`,
    "i",
  ));
  const whPairs = [...String(text).matchAll(/\bW\s*(\d+(?:[.,]\d+)?)\s*[xX×]\s*H\s*(\d+(?:[.,]\d+)?)/gi)]
    .map(match => `W${match[1]}xH${match[2]}`);
  const cover = has("NAP"), zAccessory = has("PHU KIEN") && has("CHU Z");

  // Nắp có quy tắc riêng và luôn được xét trước phụ kiện không có nắp.
  if (cover) {
    if (zAccessory) return {value:width && zAxis ? `W${width}xZ${zAxis}` : width ? `W${width}` : "",trusted:!!(width && zAxis),enforced:true};
    if (has("TE") && has("THU")) {
      const widths = dimensions.W.slice(0,3);
      return {value:widths.map(value => `W${value}`).join("/"),trusted:widths.length >= 3,enforced:true};
    }
    if (has("CON") || has("THU")) {
      const widths = widthPair ? [widthPair[1],widthPair[2]] : dimensions.W.slice(0,2);
      return {value:widths.length >= 2 ? `W${widths[0]}/W${widths[1]}` : widths[0] ? `W${widths[0]}` : "",trusted:widths.length >= 2,enforced:true};
    }
    return {value:width ? `W${width}` : "",trusted:!!width,enforced:true};
  }

  if (zAccessory) return {value:width && height && zAxis ? `W${width}xH${height}xZ${zAxis}` : whPairs[0] || (width ? `W${width}` : ""),trusted:!!(width && height && zAxis),enforced:true};
  if (has("DEU") && shared?.widths?.length && shared.widths.every(value => value === shared.widths[0])) {
    return {value:`W${shared.widths[0]}xH${shared.height}`,trusted:true,enforced:true};
  }
  if (has("TU CHAC") && has("THU")) {
    if (shared?.widths.length >= 4) return {value:`W${shared.widths.slice(0,4).join("/")}xH${shared.height}`,trusted:true,enforced:true};
    return {value:whPairs.slice(0,4).join("/"),trusted:whPairs.length >= 4,enforced:true};
  }
  if (has("TE") && has("THU")) {
    if (shared?.widths.length >= 3) return {value:`W${shared.widths.slice(0,3).join("/")}xH${shared.height}`,trusted:true,enforced:true};
    if (sharedHeightTriple) return {value:`W${sharedHeightTriple[1]}/${sharedHeightTriple[2]}/${sharedHeightTriple[3]}xH${sharedHeightTriple[4]}`,trusted:true,enforced:true};
    return {value:whPairs.slice(0,3).join("/"),trusted:whPairs.length >= 3,enforced:true};
  }
  if (has("CON") || (has("Y") && has("THU"))) {
    if (shared?.widths.length >= 2) return {value:`W${shared.widths.slice(0,2).join("/")}xH${shared.height}`,trusted:true,enforced:true};
    if (sharedHeightPair) return {value:`W${sharedHeightPair[1]}/${sharedHeightPair[2]}xH${sharedHeightPair[3]}`,trusted:true,enforced:true};
    return {value:whPairs.slice(0,2).join("/"),trusted:whPairs.length >= 2,enforced:true};
  }
  if (has("CUT") && has("THU")) {
    if (shared?.widths.length >= 2) return {value:`W${shared.widths.slice(0,2).join("/")}xH${shared.height}`,trusted:true,enforced:true};
    return {value:whPairs.slice(0,2).join("/"),trusted:whPairs.length >= 2,enforced:true};
  }
  if (has("CUT") || has("CHECH") || has("TE DEU") || has("TU CHAC DEU") || has("Y DEU")) {
    if (shared?.widths.length) return {value:`W${shared.widths[0]}xH${shared.height}`,trusted:true,enforced:true};
    return {value:whPairs[0] || "",trusted:whPairs.length >= 1,enforced:true};
  }
  return null;
};
// Khóa này giữ phần nhận diện của mô tả và loại bỏ kích thước thay đổi theo
// từng dòng (D110x90, 160x110 mm, M10…). Chỉ dùng để suy ra Nhóm/Vật tư.
const stableAliasKey = value => fold(value)
  // Số đường là đặc tính phân loại của hộp nối, không phải kích thước.
  .replace(/\b1\s+DUONG\b/g, " MOTDUONG ")
  .replace(/\b2\s+DUONG\b/g, " HAIDUONG ")
  .replace(/\b3\s+DUONG\b/g, " BADUONG ")
  .replace(/\b4\s+DUONG\b/g, " BONDUONG ")
  .replace(/\b(?:DN|D|M|T|W|H|L|Z)?\d+(?:X\d+){0,3}(?:\s*(?:MM|CM|M))?\b/g, " ")
  // Dây/cáp: tiết diện và điện áp có thể đổi thứ tự hoặc cách viết nhưng
  // không làm thay đổi Nhóm/Vật tư khi đối chiếu Alias tương tự.
  .replace(/\b\d+\s*[X*×]\s*\d+(?:[.,]\d+)?\s*MM\s*(?:2|²)\b/g, " ")
  .replace(/\b\d+(?:[.,]\d+)?\s*\/\s*\d+(?:[.,]\d+)?\s*KV\b/g, " ")
  .replace(/\b(?:SCH|PN)\s*\d+(?:[.,]\d+)?\b/g, " ")
  // Mã sản phẩm (ABU992, EHA016...) và trạng thái lỗ/chờ thường thay đổi
  // theo quy cách nhưng không làm thay đổi Nhóm vật tư hoặc Vật tư.
  .replace(/\b[A-Z]{2,}\d+[A-Z0-9]*(?:\s+[A-Z])?\b/g, " ")
  .replace(/\bKHONG\s+LO(?:\s+CHO)?\b|\bLO\s+CHO\b/g, " ")
  .replace(/\s+/g, " ").trim();
const cell = (row, ...names) => names.map(name => row[name]).find(value => value !== undefined && value !== null && String(value).trim())?.toString().trim() || "";
const catalogGroups = row => String(cell(row,"Nhóm vật tư") || "").split(";").map(item => fold(item)).filter(Boolean);
const catalogRowAppliesToGroup = (row, group) => {
  const groups = catalogGroups(row), key = fold(group);
  return !groups.length || !key || groups.includes(key);
};
export function splitErpDimensionValues(value) {
  const raw = String(value ?? "").trim();
  if (!raw || fold(raw) === "THIEU") return [];
  const pipe = raw.match(/^\s*(DN|D)\s*(\d+(?:[.,]\d+)?)(.*)$/i);
  if (pipe) {
    const prefix = pipe[1].toUpperCase();
    const values = [pipe[2],...[...pipe[3].matchAll(/(?:[xX×\/\-])\s*(?:DN|D)?\s*(\d+(?:[.,]\d+)?)/gi)].map(item => item[1])];
    return [...new Set(values.map(item => `${prefix}${normalizeDimensionNumber(item)}`))];
  }
  const labelled = [...raw.matchAll(/(?:^|[xX×\/\s])([WHLZ])\s*(\d+(?:[.,]\d+)?)/gi)];
  if (labelled.length) return [...new Set(labelled.map(item => normalizeDimensionNumber(item[2])))];
  const metric = raw.match(/^\s*M\s*(\d+(?:[.,]\d+)?)/i);
  if (metric) return [normalizeDimensionNumber(metric[1])];
  const numbers = [...raw.matchAll(/\d+(?:[.,]\d+)?/g)].map(item => normalizeDimensionNumber(item[0]));
  return numbers.length ? [...new Set(numbers)] : [raw];
}
const exactCatalogMatch = (rows, value, fields) => {
  const key = fold(value);
  return !!key && rows.some(row => fields.some(field => fold(cell(row,field)) === key));
};
function best(text, rows, extract, result) {
  const source = preserve(text);
  const matches = rows.map(row => ({row, term:preserve(extract(row))})).filter(x => x.term && source.includes(x.term)).sort((a,b) => b.term.length - a.term.length);
  return matches.length ? result(matches[0].row) : "";
}
function bestByTokens(text, rows, extract, result) {
  const ignored = new Set(["ống","phụ","kiện","vật","tư","và"]);
  const isDimension = token => /^(?:dn|d|m|t|l|w|h|z)\d+(?:[.,]\d+)?$/i.test(token);
  const source = new Set(preserve(text).split(" ").filter(token => token.length >= 2 && !ignored.has(token) && !isDimension(token)));
  const ranked = rows.map(row => {
    const terms = preserve(extract(row)).split(" ").filter(token => token.length >= 2 && !ignored.has(token));
    const matches = terms.filter(token => source.has(token));
    return {row, score:matches.length, coverage:terms.length ? matches.length / terms.length : 0, inputCoverage:source.size ? matches.length / source.size : 0, length:matches.join("").length};
  }).filter(item => item.score >= 2 && item.coverage >= 0.6 && item.inputCoverage >= 0.6).sort((a,b) => b.score - a.score || b.inputCoverage - a.inputCoverage || b.coverage - a.coverage || b.length - a.length);
  return ranked.length && (ranked.length === 1 || ranked[0].score > ranked[1].score || ranked[0].inputCoverage > ranked[1].inputCoverage || ranked[0].coverage > ranked[1].coverage) ? result(ranked[0].row) : "";
}
function bestCanonicalMaterial(text, rows, extract, result) {
  const ignored = new Set(["ONG","PHU","KIEN","VAT","TU","VA"]), discriminators = new Set(["THU","DEU"]);
  const tokens = value => canonicalMaterialFold(value).split(" ").filter(token => token.length >= 2 && !ignored.has(token) && !/^(?:DN|D|M|T|L|W|H|Z)?\d+(?:[.,]\d+)?$/.test(token));
  const input = tokens(text), source = new Set(input);
  const ranked = rows.map(row => {
    const terms = tokens(extract(row)), matches = terms.filter(token => source.has(token));
    const extraDiscriminators = terms.filter(token => discriminators.has(token) && !source.has(token)).length;
    return {row,score:matches.length,coverage:terms.length ? matches.length / terms.length : 0,inputCoverage:source.size ? matches.length / source.size : 0,extraDiscriminators,length:terms.length};
  }).filter(item => item.score >= 2 && item.inputCoverage >= .5)
    .sort((a,b) => b.score - a.score || b.inputCoverage - a.inputCoverage || a.extraDiscriminators - b.extraDiscriminators || b.coverage - a.coverage || a.length - b.length);
  if (!ranked.length) return "";
  const [first,second] = ranked;
  const unique = !second || first.score > second.score || first.inputCoverage > second.inputCoverage || first.extraDiscriminators < second.extraDiscriminators || first.coverage > second.coverage || first.length < second.length;
  return unique ? result(first.row) : "";
}
function bestCatalogMaterial(text, rows, extract, result) {
  const ignored = new Set(["ống","phụ","kiện","vật","tư","và"]);
  const variable = token => /^(?:dn|d|m|t|l|w|h|z)\d+(?:[.,]\d+)?$/i.test(token) || /\d/.test(token) && /^(?:din|en|jis|astm|bs|iso|sch|pn)/i.test(token);
  const source = new Set(preserve(text).split(" ").filter(token => token.length >= 2 && !ignored.has(token) && !variable(token)));
  const ranked = rows.map(row => {
    const terms = preserve(extract(row)).split(" ").filter(token => token.length >= 2 && !ignored.has(token) && !variable(token));
    const matches = terms.filter(token => source.has(token));
    return {row,score:matches.length,coverage:terms.length ? matches.length / terms.length : 0,length:terms.length};
  }).filter(item => item.score >= 2 && item.coverage >= .7)
    .sort((a,b) => b.score - a.score || b.coverage - a.coverage || a.length - b.length);
  if (!ranked.length) return "";
  const [first,second] = ranked;
  return !second || first.score > second.score || first.coverage > second.coverage || first.length < second.length ? result(first.row) : "";
}
function bestAliasByStableTokens(text, rows) {
  const variable = token => /^\d+(?:[.,]\d+)?$/.test(token) || /^[A-Z]{2,}\d+[A-Z0-9-]*$/i.test(token) || /^(DN|D|M|T|W|H|L|Z)$/i.test(token);
  const branchCount = value => fold(value).match(/\b([1-4])\s+DUONG\b/)?.[1] || "";
  const sourceCount = branchCount(text);
  const tokens = value => preserve(value).split(" ").filter(token => token.length >= 2 && !variable(token));
  const source = new Set(tokens(text));
  const ranked = rows.map(row => {
    const candidateCount = branchCount(cell(row,"Alias"));
    if (sourceCount && candidateCount && sourceCount !== candidateCount) return null;
    const terms = tokens(cell(row,"Alias")), matches = terms.filter(token => source.has(token));
    return {row,score:matches.length,coverage:terms.length ? matches.length / terms.length : 0,inputCoverage:source.size ? matches.length / source.size : 0};
  }).filter(item => item && item.score >= 2 && item.coverage >= 0.55 && item.inputCoverage >= 0.6).sort((a,b) => b.score - a.score || b.inputCoverage - a.inputCoverage || b.coverage - a.coverage);
  return ranked.length && (ranked.length === 1 || ranked[0].score > ranked[1].score || ranked[0].inputCoverage > ranked[1].inputCoverage || ranked[0].coverage > ranked[1].coverage) ? cell(ranked[0].row,"Target") : "";
}
// Dùng cho Alias ma trận khi người dùng chỉ đảo thứ tự các thành phần như
// "Dây điện Cu/PVC, 1x1.5mm2, 0.6/1kV, màu đen". Kích thước/điện áp/mã được
// bỏ qua, nhưng chỉ suy luận khi tất cả ứng viên tốt nhất cùng Nhóm/Vật tư.
// Dùng fold để "đen" và "den", hoặc "Dây" và "Day", có cùng khóa. Điều
// này đặc biệt quan trọng với mô tả dây/cáp do các nhà cung cấp hay đảo thứ
// tự thông số, bỏ dấu hoặc đổi dấu phân cách.
const matrixTokens = value => fold(value).split(" ").filter(token => token.length >= 2 && !/\d/.test(token) && !/^(MM|KV|V|HZ|BAR|PN|SCH)$/.test(token));
function relatedMatrixByTokens(text, index) {
  const tokens = matrixTokens(text), candidates = new Set();
  for (const token of new Set(tokens)) for (const row of index.get(token) || []) candidates.add(row);
  const source = new Set(tokens), ranked = [...candidates].filter(row => compatibleMatrixRow(text,row)).map(row => {
    const terms = matrixTokens(cell(row,"Tên gọi ibom","Source")), matches = terms.filter(token => source.has(token));
    return {row,score:matches.length,coverage:terms.length ? matches.length / terms.length : 0,inputCoverage:source.size ? matches.length / source.size : 0,signature:`${fold(cell(row,"Nhóm vật tư"))}|${fold(cell(row,"Vật tư"))}`};
  }).filter(item => item.score >= 3 && item.coverage >= .7 && item.inputCoverage >= .45 && item.signature !== "|")
    .sort((left,right) => right.score - left.score || right.coverage - left.coverage || right.inputCoverage - left.inputCoverage);
  if (!ranked.length) return null;
  const best = ranked[0], equallyRelevant = ranked.filter(item => item.score === best.score && item.coverage >= best.coverage - .1);
  return equallyRelevant.every(item => item.signature === best.signature) ? best.row : null;
}

export class Normalizer {
  constructor(data) {
    this.data = data;
    this.memo = new Map();
    this.aliasMemo = new Map();
    this.groupMemo = new Map();
    this.materialMemo = new Map();
    const deletedKeys = new Set(data.DeletedAliasMatrixKeys || []);
    const isDeleted = row => { const source = cell(row,"SourceKey") || cell(row,"Tên gọi ibom") || row.Source || ""; return deletedKeys.has(fold(source)); };
    const aliasMatrixRows = (data.AliasMatrix || []).filter(row => !isDeleted(row));
    // Alias tập trung đã chứa dữ liệu mẫu chính thức. Bỏ bản Training trùng
    // nguồn để không dựng chỉ mục hai lần cho hàng chục nghìn dòng.
    const matrixSources = new Set(aliasMatrixRows.map(row => fold(cell(row,"Tên gọi ibom","SourceKey","Source"))).filter(Boolean));
    const trainingRows = (data.Training || []).filter(row => !isDeleted(row) && !matrixSources.has(fold(cell(row,"Tên gọi ibom","SourceKey","Source"))));
    this.aliasMatrixByName = new Map(aliasMatrixRows.map(row => [preserve(cell(row,"Tên gọi ibom")),row]).filter(([key]) => key));
    this.aliasMatrixByKey = new Map(aliasMatrixRows.map(row => [fold(cell(row,"SourceKey","Tên gọi ibom")),row]).filter(([key]) => key));
    this.trainingByName = new Map(trainingRows.map(row => [preserve(cell(row,"Tên gọi ibom")),row]).filter(([key]) => key));
    this.aliasMatrixByStableKey = new Map();
    this.relatedAliasTokenIndex = new Map();
    for (const row of [...aliasMatrixRows,...trainingRows]) {
      const key = stableAliasKey(cell(row,"Tên gọi ibom","Source"));
      const signature = `${fold(cell(row,"Nhóm vật tư"))}|${fold(cell(row,"Vật tư"))}`;
      if (!key || signature === "|") continue;
      const previous = this.aliasMatrixByStableKey.get(key);
      // Nếu cùng một khóa dẫn tới hai loại vật tư khác nhau, không suy đoán.
      if (!previous) this.aliasMatrixByStableKey.set(key,{row,signature});
      else if (previous.signature !== signature) this.aliasMatrixByStableKey.set(key,null);
      for (const token of new Set(matrixTokens(cell(row,"Tên gọi ibom","Source")))) {
        if (!this.relatedAliasTokenIndex.has(token)) this.relatedAliasTokenIndex.set(token,new Set());
        this.relatedAliasTokenIndex.get(token).add(row);
      }
    }
    for (const [key,entry] of this.aliasMatrixByStableKey) {
      if (!entry) this.aliasMatrixByStableKey.delete(key); else this.aliasMatrixByStableKey.set(key,entry.row);
    }
    this.matrixByMaterial = new Map((data.MATRIX || []).map(row => [fold(cell(row,"Đối tượng")),row]).filter(([key]) => key));
    this.aliases = new Map();
    for (const row of data.Alias || []) { const type = fold(cell(row,"Type")); if (!type) continue; if (!this.aliases.has(type)) this.aliases.set(type,[]); this.aliases.get(type).push(row); }
    this.aliasTokenIndex = new Map();
    for (const [type,rows] of this.aliases) {
      const index = new Map();
      for (const row of rows) for (const token of new Set(preserve(cell(row,"Alias")).split(" ").filter(token => token.length >= 2))) {
        if (!index.has(token)) index.set(token,new Set()); index.get(token).add(row);
      }
      this.aliasTokenIndex.set(type,index);
    }
    this.aliasExact = new Map((data.Alias || []).map(row => [`${fold(cell(row,"Type"))}|${preserve(cell(row,"Alias"))}`,cell(row,"Target")]).filter(([,target]) => target));
    this.materialsByGroup = new Map();
    this.materialsByGroupFamily = new Map();
    for (const row of data.VAT_TU || []) {
      const key = fold(cell(row,"Tên nhóm vật tư")), family = protectedMaterialFamily(cell(row,"Tên vật tư","Mô tả"));
      if (!this.materialsByGroup.has(key)) this.materialsByGroup.set(key,[]); this.materialsByGroup.get(key).push(row);
      if (family) for (const familyKey of [`${key}|${family}`,`*|${family}`]) {
        if (!this.materialsByGroupFamily.has(familyKey)) this.materialsByGroupFamily.set(familyKey,[]);
        this.materialsByGroupFamily.get(familyKey).push(row);
      }
    }
    this.masterByGroupMaterial = new Map();
    this.masterByGroup = new Map();
    this.masterByGroupFamily = new Map();
    for (const row of data.MASTER || []) {
      const groupKey = fold(cell(row,"Nhóm vật tư")), key = `${groupKey}|${fold(cell(row,"Vật tư"))}`, family = protectedMaterialFamily(cell(row,"Vật tư"));
      if (!this.masterByGroupMaterial.has(key)) this.masterByGroupMaterial.set(key,[]); this.masterByGroupMaterial.get(key).push(row);
      if (!this.masterByGroup.has(groupKey)) this.masterByGroup.set(groupKey,[]); this.masterByGroup.get(groupKey).push(row);
      if (family) for (const familyKey of [`${groupKey}|${family}`,`*|${family}`]) {
        if (!this.masterByGroupFamily.has(familyKey)) this.masterByGroupFamily.set(familyKey,[]);
        this.masterByGroupFamily.get(familyKey).push(row);
      }
    }
    this.groupByMaterial = new Map((data.VAT_TU || []).map(row => [fold(cell(row,"Tên vật tư")),cell(row,"Tên nhóm vật tư")]).filter(([key]) => key));
    for (const row of data.MASTER || []) if (!this.groupByMaterial.has(fold(cell(row,"Vật tư")))) this.groupByMaterial.set(fold(cell(row,"Vật tư")),cell(row,"Nhóm vật tư"));
    this.materialExact = new Map((data.VAT_TU || []).map(row => [preserve(cell(row,"Tên vật tư","Mô tả")),row]).filter(([key,row]) => key && row));
    this.erpGroupSet = new Set((data.NHOM_VAT_TU || []).map(row => fold(cell(row,"Tên nhóm vật tư"))).filter(Boolean));
    this.erpMaterialPairSet = new Set((data.VAT_TU || []).map(row => `${fold(cell(row,"Tên nhóm vật tư"))}|${fold(cell(row,"Tên vật tư","Mô tả"))}`).filter(key => key !== "|"));
    this.erpDimensionByGroup = new Map();
    this.pipeOutsideByGroup = new Map();
    for (const row of data.KICH_THUOC || []) for (const groupName of catalogGroups(row)) {
      if (!this.erpDimensionByGroup.has(groupName)) this.erpDimensionByGroup.set(groupName,{exact:new Set(),numbers:new Set()});
      const index = this.erpDimensionByGroup.get(groupName);
      for (const field of ["Mô tả","Kích thước danh nghĩa"]) { const key = fold(cell(row,field)); if (key) index.exact.add(key); }
      for (const number of dimensionNumbers([cell(row,"Mô tả"),cell(row,"Kích thước danh nghĩa"),cell(row,"Đường kính ngoài")].join(" "))) index.numbers.add(number);
      const outside = Number(cell(row,"Đường kính ngoài").replace(",","."));
      if (/^DN\s*\d/i.test(cell(row,"Mô tả")) && Number.isFinite(outside)) {
        if (!this.pipeOutsideByGroup.has(groupName)) this.pipeOutsideByGroup.set(groupName,[]);
        this.pipeOutsideByGroup.get(groupName).push({
          outside,
          nominal:normalizeDimensionNumber(cell(row,"Kích thước danh nghĩa") || cell(row,"Mô tả").replace(/^DN\s*/i,"")),
        });
      }
    }
    this.erpRangeByGroup = new Map();
    for (const row of data.DAI_THONG_SO || []) for (const groupName of catalogGroups(row)) {
      if (!this.erpRangeByGroup.has(groupName)) this.erpRangeByGroup.set(groupName,new Set());
      for (const field of ["Mô tả","Tên dải thông số kỹ thuật"]) { const key = fold(cell(row,field)); if (key) this.erpRangeByGroup.get(groupName).add(key); }
    }
    this.erpStandards = new Set((data.TIEU_CHUAN || []).flatMap(row => [fold(cell(row,"Tên tiêu chuẩn")),fold(cell(row,"Mô tả"))]).filter(Boolean));
    this.erpFinishes = new Set((data.HOAN_THIEN || []).flatMap(row => [fold(cell(row,"Tên hoàn thiện")),fold(cell(row,"Mô tả"))]).filter(Boolean));
    this.erpInstallTypes = new Set((data.KIEU_LAP_DAT || []).flatMap(row => [fold(cell(row,"Tên kiểu lắp đặt")),fold(cell(row,"Mô tả"))]).filter(Boolean));
    this.erpIssueMemo = new Map();
  }
  erpIssues(result = {}, sourceText = "") {
    const group = cell(result,"Nhóm vật tư"), material = cell(result,"Vật tư"), requirements = this.requirements(material);
    const dimension = cell(result,"Kích thước"), range = cell(result,"Dải thông số kỹ thuật"), standard = cell(result,"Tiêu chuẩn");
    const installType = cell(result,"Kiểu lắp đặt"), finish = cell(result,"Hoàn thiện");
    const memoKey = [group,material,dimension,range,standard,installType,finish,requirements.hasMatrix ? "1" : "0",sourceText].map(fold).join("|");
    if (this.erpIssueMemo.has(memoKey)) return [...this.erpIssueMemo.get(memoKey)];
    const missing = [];
    const groupKey = fold(group);
    // Chỉ có thể đối chiếu thuộc tính ERP sau khi đã xác định được đúng nhóm.
    // Nếu nhóm còn trống, việc báo DN/PN/tiêu chuẩn "chưa có trong ERP" là
    // sai ngữ cảnh vì chưa biết phải tra các thuộc tính đó trong nhóm nào.
    if (!groupKey) {
      this.erpIssueMemo.set(memoKey,[]);
      return [];
    }
    const groupExists = this.erpGroupSet.has(groupKey);
    if (!groupExists) {
      const value = [group];
      this.erpIssueMemo.set(memoKey,value);
      return [...value];
    }
    const materialExists = !material || this.erpMaterialPairSet.has(`${groupKey}|${fold(material)}`);
    if (material && !materialExists) missing.push(material);

    const sizeIndex = this.erpDimensionByGroup.get(groupKey) || {exact:new Set(),numbers:new Set()};
    for (const part of splitErpDimensionValues(dimension)) {
      const exactPipeOrMetric = /^(?:DN|D)\d/i.test(part);
      const exists = exactPipeOrMetric
        ? sizeIndex.exact.has(fold(part))
        : sizeIndex.numbers.has(normalizeDimensionNumber(part));
      if (!exists) missing.push(part);
    }
    const rangeIndex = this.erpRangeByGroup.get(groupKey) || new Set();
    const rangeParts = /^T\s*\d+(?:[.,]\d+)?\s*\/\s*T?\s*\d+(?:[.,]\d+)?$/i.test(range)
      ? [...range.matchAll(/T?\s*(\d+(?:[.,]\d+)?)/gi)].map(item => `T${normalizeDimensionNumber(item[1])}`)
      : [range];
    for (const part of rangeParts.filter(Boolean)) if (!rangeIndex.has(fold(part))) missing.push(part);
    if (standard && !this.erpStandards.has(fold(standard))) missing.push(standard);
    if (finish && this.erpFinishes.size && !this.erpFinishes.has(fold(finish))) missing.push(finish);
    if (installType && this.erpInstallTypes.size && !this.erpInstallTypes.has(fold(installType))) missing.push(installType);

    // Khi ma trận yêu cầu Tiêu chuẩn nhưng bộ chuẩn hóa chưa tìm thấy, chỉ
    // giữ tiêu chuẩn xuất hiện đích danh trong nguồn. Phải dùng cùng bộ đọc
    // Unicode với bước chuẩn hóa chính; regex \b kiểu cũ từng lấy nhầm "EN"
    // nằm trong chữ tiếng Việt "đen".
    if (!standard && requirements.fields?.["Tiêu chuẩn"]) {
      const token = sourceStandardValue(sourceText,group);
      if (token && !this.erpStandards.has(fold(token))) missing.push(token);
    }
    const value = [...new Set(missing.filter(Boolean))];
    this.erpIssueMemo.set(memoKey,value);
    return [...value];
  }
  alias(type, text) {
    const typeKey = fold(type), textKey = preserve(text), memoKey = `${typeKey}|${textKey}`;
    if (this.aliasMemo.has(memoKey)) return this.aliasMemo.get(memoKey);
    const rows = this.aliases.get(typeKey) || [], exact = this.aliasExact.get(memoKey);
    if (exact) { this.aliasMemo.set(memoKey,exact); return exact; }
    const candidates = new Set(), index = this.aliasTokenIndex.get(typeKey);
    if (index) for (const token of new Set(textKey.split(" ").filter(token => token.length >= 2))) for (const row of index.get(token) || []) candidates.add(row);
    const shortlist = candidates.size ? [...candidates] : rows;
    const value = best(text, shortlist, row => cell(row,"Alias"), row => cell(row,"Target")) || ((typeKey === "GROUP" || typeKey === "MATERIAL") ? bestAliasByStableTokens(text,shortlist) : "") || bestByTokens(text,shortlist,row => cell(row,"Alias"),row => cell(row,"Target"));
    this.aliasMemo.set(memoKey,value);
    return value;
  }
  group(text) {
    const key = preserve(text);
    if (this.groupMemo.has(key)) return this.groupMemo.get(key);
    const rows = (this.data.NHOM_VAT_TU || []).filter(row => compatibleSourceMaterial(text,cell(row,"Tên nhóm vật tư")) && compatibleElectricalDomain(text,cell(row,"Tên nhóm vật tư")));
    const aliasCandidate = this.alias("GROUP", text), aliasValue = compatibleSourceMaterial(text,aliasCandidate) && compatibleElectricalDomain(text,aliasCandidate) ? aliasCandidate : "";
    const domain = electricalDomain(text);
    const electricalGroup = domain === "POWER_CABLE"
      ? rows.find(row => fold(cell(row,"Tên nhóm vật tư")) === "DAY CAP DIEN")
      : domain === "SIGNAL_CABLE"
        ? rows.find(row => fold(cell(row,"Tên nhóm vật tư")) === "DAY CAP DIEN NHE")
        : null;
    const sourceGroupKey = fold(text);
    const businessGroup = /^SON\s+MAU\b/.test(sourceGroupKey)
      ? rows.find(row => fold(cell(row,"Tên nhóm vật tư")) === "VAT TU PHU") : null;
    const structuralGroup = /\bTHANG\s+CAP\b/.test(sourceGroupKey)
      ? rows.find(row => /\bTHANG\s+CAP\b/.test(fold(cell(row,"Tên nhóm vật tư"))))
      : /\bMANG\s+CAP\b/.test(sourceGroupKey)
        ? rows.find(row => /\bMANG\s+CAP\b/.test(fold(cell(row,"Tên nhóm vật tư"))))
        : null;
    const materialGroups = sourceMaterials(text).length
      ? [...new Set(rows.map(row => cell(row,"Tên nhóm vật tư")).filter(name => sourceMaterials(name).length))]
      : [];
    const sourceKey = fold(text), qualifiedMaterialGroups = materialGroups.filter(name => {
      const candidateKey = fold(name);
      return sourceKey.includes("NOI NHANH") ? candidateKey.includes("NOI NHANH") : !candidateKey.includes("NOI NHANH");
    });
    const value = cell(businessGroup || structuralGroup || {},"Tên nhóm vật tư")
      || cell(electricalGroup || {},"Tên nhóm vật tư") || aliasValue
      || best(text,rows,row => cell(row,"Tên nhóm vật tư"),row => cell(row,"Tên nhóm vật tư"))
      || (qualifiedMaterialGroups.length === 1 ? qualifiedMaterialGroups[0] : "")
      || bestCanonicalMaterial(text,rows,row => cell(row,"Tên nhóm vật tư"),row => cell(row,"Tên nhóm vật tư"));
    this.groupMemo.set(key,value);
    return value;
  }
  material(text, group) {
    const groupKey = fold(group), expectedFamily = protectedMaterialFamily(text);
    const memoKey = `${groupKey}|${preserve(text)}`;
    if (this.materialMemo.has(memoKey)) return this.materialMemo.get(memoKey);
    const rows = group ? (this.materialsByGroup.get(groupKey) || []) : (this.data.VAT_TU || []);
    const masterRows = group ? (this.masterByGroup.get(groupKey) || []) : (this.data.MASTER || []);
    const exact = this.materialExact.get(preserve(text));
    const exactValue = !group || fold(cell(exact || {},"Tên nhóm vật tư")) === groupKey ? cell(exact || {},"Tên vật tư","Mô tả") : "";
    const aliasValue = this.alias("MATERIAL", text);
    const indexedFamilyRows = expectedFamily ? (this.materialsByGroupFamily.get(`${group ? groupKey : "*"}|${expectedFamily}`) || []) : [];
    const indexedFamilyMasterRows = expectedFamily ? (this.masterByGroupFamily.get(`${group ? groupKey : "*"}|${expectedFamily}`) || []) : [];
    const familyRows = expectedFamily
      ? (indexedFamilyRows.length ? indexedFamilyRows : rows.filter(row => compatibleMaterial(text,cell(row,"Tên vật tư","Mô tả"))))
      : rows;
    const familyMasterRows = expectedFamily
      ? (indexedFamilyMasterRows.length ? indexedFamilyMasterRows : masterRows.filter(row => compatibleMaterial(text,cell(row,"Vật tư"))))
      : masterRows;
    const compatibleRows = familyRows.filter(row => compatibleSourceMaterial(text,`${cell(row,"Tên nhóm vật tư")} ${cell(row,"Tên vật tư","Mô tả")}`));
    const compatibleMasterRows = familyMasterRows.filter(row => compatibleSourceMaterial(text,`${cell(row,"Nhóm vật tư")} ${cell(row,"Vật tư")}`));
    const explicitMaterial = explicitElectricalMaterial(text);
    const explicitCatalogValue = explicitMaterial
      ? cell(rows.find(row => fold(cell(row,"Tên vật tư","Mô tả")) === fold(explicitMaterial)) || {},"Tên vật tư","Mô tả") || explicitMaterial
      : "";
    const value = explicitCatalogValue
      || (compatibleMaterial(text,aliasValue) && compatibleSourceMaterial(text,aliasValue) && compatibleElectricalDomain(text,aliasValue) ? aliasValue : "")
      || (compatibleMaterial(text,exactValue) && compatibleSourceMaterial(text,exactValue) && compatibleElectricalDomain(text,exactValue) ? exactValue : "")
      // Tên ngắn như "Ống uPVC,D220,PN6" chỉ còn một từ phân biệt sau
      // khi bỏ từ chung "Ống". Ưu tiên tên danh mục xuất hiện nguyên cụm
      // trong mô tả trước bộ dò yêu cầu tối thiểu hai token.
      || best(text,compatibleRows,row => cell(row,"Tên vật tư","Mô tả"),row => cell(row,"Tên vật tư"))
      || best(text,compatibleMasterRows,row => cell(row,"Vật tư"),row => cell(row,"Vật tư"))
      || bestByTokens(text,compatibleRows,row => cell(row,"Tên vật tư","Mô tả"),row => cell(row,"Tên vật tư"))
      || bestByTokens(text,compatibleMasterRows,row => cell(row,"Vật tư"),row => cell(row,"Vật tư"))
      || bestCatalogMaterial(text,compatibleRows,row => cell(row,"Tên vật tư","Mô tả"),row => cell(row,"Tên vật tư"))
      || bestCatalogMaterial(text,compatibleMasterRows,row => cell(row,"Vật tư"),row => cell(row,"Vật tư"))
      || bestCanonicalMaterial(text,compatibleRows,row => cell(row,"Tên vật tư","Mô tả"),row => cell(row,"Tên vật tư"))
      || bestCanonicalMaterial(text,compatibleMasterRows,row => cell(row,"Vật tư"),row => cell(row,"Vật tư"));
    this.materialMemo.set(memoKey,value);
    return value;
  }
  materialByDimensionForm(text, group, material) {
    const groupKey = fold(group), sourceKey = canonicalMaterialFold(text), materialKey = canonicalMaterialFold(material);
    const pipeGroup = groupKey === "ONG" || groupKey.startsWith("ONG ");
    const trayGroup = groupKey === "THANG" || groupKey.startsWith("THANG ") || groupKey === "MANG PHU KIEN" || groupKey.startsWith("MANG PHU KIEN ");
    const rows = this.materialsByGroup.get(groupKey) || [];
    const resolveTarget = (targetFold, fallback) => {
      const exact = rows.find(row => fold(cell(row,"Tên vật tư","Mô tả")) === targetFold);
      if (exact) return cell(exact,"Tên vật tư","Mô tả");
      const family = targetFold.match(/\b(TE|Y|TU CHAC)\s+(DEU|THU)\b/)?.[1] || "";
      const form = targetFold.includes(" THU") ? "THU" : "DEU";
      const candidates = rows.filter(row => {
        const key = fold(cell(row,"Tên vật tư","Mô tả"));
        return (!family || new RegExp(`\\b${family}\\s+${form}\\b`).test(key)) && compatibleSourceMaterial(text,key);
      });
      return bestCanonicalMaterial(`${fallback} ${text}`,candidates,row => cell(row,"Tên vật tư","Mô tả"),row => cell(row,"Tên vật tư","Mô tả")) || fallback;
    };

    if (pipeGroup) {
      const kind = /\bTE\b/.test(sourceKey) ? "TE" : /\bY\b/.test(sourceKey) ? "Y" : "";
      const explicitlyClassified = /\b(?:DEU|THU|GIAM)\b/.test(sourceKey);
      const diameters = pipeDiameterValues(text);
      if (kind && !explicitlyClassified && diameters.length) {
        const form = diameters.length >= 2 ? "THU" : "DEU";
        let candidate = String(material || "");
        if (/(?:đều|thu)/iu.test(candidate)) candidate = candidate.replace(/(?:đều|thu)/iu,form === "THU" ? "thu" : "đều");
        else if (candidate) candidate = candidate.replace(kind === "TE" ? /Tê/iu : /\bY\b/i,match => `${match} ${form === "THU" ? "thu" : "đều"}`);
        else candidate = `${kind === "TE" ? "Tê" : "Y"} ${form === "THU" ? "thu" : "đều"}`;
        return resolveTarget(fold(candidate),candidate);
      }
    }

    if (trayGroup && (sourceKey.includes(" DEU") || materialKey.includes(" DEU"))) {
      const shared = sharedTrayDimensions(text);
      if (shared?.widths.length >= 2 && !shared.widths.every(value => value === shared.widths[0])) {
        const candidate = String(material || "").replace(/đều/iu,"thu");
        if (candidate !== material) return resolveTarget(fold(candidate),candidate);
      }
    }
    return material;
  }
  groupForMaterial(material) {
    return this.groupByMaterial.get(fold(material)) || "";
  }
  pvcJunction(text) {
    const source = fold(text), match = source.match(/\bHOP\s+NOI\s+([1-4])\s+DUONG\b/);
    if (!match || !(/\bPHI\s*\d+\b/.test(source) || /\bBJ\d+\b/.test(source))) return null;
    const count = match[1];
    const material = count === "2"
      ? (/VUONG\s+GOC/.test(source) ? "Hộp chia ngả 2 đường vuông góc PVC" : "Hộp chia ngả 2 đường thẳng PVC")
      : `Hộp chia ngả ${count} đường PVC`;
    const group = this.groupForMaterial(material);
    return group ? {group,material} : null;
  }
  pprThreadedElbow(text) {
    const raw = String(text ?? ""), source = fold(raw), match = source.match(/\b(?:CO|CUT)\s+REN\s+(TRONG|NGOAI)\b/);
    if (!match) return null;
    // Khi nhà cung cấp bỏ chữ PPR, cặp đường kính hệ mét x ren inch vẫn là
    // tín hiệu đủ mạnh để phân biệt cút chuyển ren PPR với thiết bị vệ sinh.
    const hasMetricToInch = /\b(?:DN|D)\s*\d+(?:[.,]\d+)?\s*[xX×]\s*(?:\d+\s+)?\d+\s*\/\s*\d+\s*(?:["”]|INCH\b)?/i.test(raw)
      || /\b(?:DN|D)\s*\d+(?:[.,]\d+)?\s*[xX×]\s*\d+\s*(?:["”]|INCH\b)/i.test(raw);
    if (!source.includes("PPR") && !hasMetricToInch) return null;
    const material = match[1] === "TRONG" ? "Cút ren trong PPR" : "Cút ren ngoài PPR";
    const group = this.groupForMaterial(material);
    return group ? {group,material} : null;
  }
  pprPipeByPressure(text) {
    const source = fold(text);
    if (!/\bONG\s+(?:NUOC\s+)?PPR\b/.test(source)) return null;
    const pressure = source.match(/\bPN\s*(10|16|20)\b/)?.[1];
    if (!pressure) return null;
    const material = pressure === "10" ? "Ống nước lạnh PPR" : "Ống nước nóng PPR";
    const group = this.groupForMaterial(material);
    return group ? {group,material} : null;
  }
  pipeBranchByDimensions(text, group) {
    const groupKey = fold(group);
    if (!(groupKey === "ONG" || groupKey.startsWith("ONG "))) return null;
    const source = fold(text);
    // Nhà cung cấp thường gọi Tê là "Ba chạc", "Ba chạc vuông" hoặc
    // "Ba chạc 90 độ". Ba chạc 45 độ/xiên tương ứng với họ Y. Phải đổi
    // tên gọi nguồn sang đúng họ ERP trước khi dò gần đúng; nếu không cụm
    // "ba chạc vuông" có thể rơi sang Tứ chạc hoặc giữ nguyên tên nguồn.
    const threeWay = /\bBA\s+CHAC\b/.test(source);
    const threeWayY = threeWay && (/\b45\s*(?:DO)?\b/.test(source) || /\bXIEN\b/.test(source));
    const branch = /\bTE\b/.test(source) || (threeWay && !threeWayY)
      ? "TE"
      : /\bY\b/.test(source) || threeWayY
        ? "Y"
        : "";
    if (!branch) return null;
    const diameters = pipeDiameterValues(text);
    if (!diameters.length) return null;
    const explicitlyEven = /\bDEU\b/.test(source) && diameters.every(value => value === diameters[0]);
    const form = diameters.length >= 2 && !explicitlyEven ? "THU" : "DEU";
    const candidates = (this.materialsByGroup.get(groupKey) || []).filter(row => {
      const name = fold(cell(row,"Tên vật tư","Mô tả"));
      return new RegExp(`\\b${branch}\\b`).test(name) && new RegExp(`\\b${form}\\b`).test(name) && !/\bREN\b/.test(name);
    });
    // "Tê cong giảm" là Tê cong thu, không phải Tê thu. Ngược lại, mô tả
    // không có chữ "cong" không được tự đổi sang phụ kiện cong.
    const curved = /\bCONG\b/.test(source);
    const sameShape = candidates.filter(row => /\bCONG\b/.test(fold(cell(row,"Tên vật tư","Mô tả"))) === curved);
    const ranked = (sameShape.length ? sameShape : candidates)
      .sort((left,right) => fold(cell(left,"Tên vật tư")).length - fold(cell(right,"Tên vật tư")).length);
    const material = cell(ranked[0] || {},"Tên vật tư","Mô tả");
    return material ? {group,material} : null;
  }
  pipeNamedAccessory(text, group) {
    const groupKey = fold(group), source = canonicalMaterialFold(text);
    if (!(groupKey === "ONG" || groupKey.startsWith("ONG "))) return null;
    const rows = this.materialsByGroup.get(groupKey) || [];
    let family = "";
    if (/\bTHONG\s+TAC\b/.test(source)) family = "THONG_TAC";
    else if (/^CUT\b/.test(source)) family = "CUT";
    else if (/^CHECH\b/.test(source)) family = "CHECH";
    if (!family) return null;
    let candidates = rows.filter(row => protectedMaterialFamily(cell(row,"Tên vật tư","Mô tả")) === family);
    if (family === "THONG_TAC") {
      const isDischargeCap = /\b(?:BIT|XA)\b/.test(source);
      const sameKind = candidates.filter(row => {
        const name = fold(cell(row,"Tên vật tư","Mô tả"));
        return isDischargeCap ? /\b(?:BIT|XA)\b/.test(name) : /\bTE\b/.test(name);
      });
      if (sameKind.length) candidates = sameKind;
    }
    candidates.sort((left,right) => fold(cell(left,"Tên vật tư","Mô tả")).length - fold(cell(right,"Tên vật tư","Mô tả")).length);
    const material = cell(candidates[0] || {},"Tên vật tư","Mô tả");
    return material ? {group,material} : null;
  }
  requirements(material) {
    const row = this.matrixByMaterial.get(fold(material));
    return {hasMatrix:!!row, fields:Object.fromEntries(REQUIRED.map(field => [field, row ? Number(cell(row,field)) === 1 : false]))};
  }
  masterValue(field, text, group, material) {
    text = this.propertyText ?? text;
    if (field === STANDARD_COLUMNS[4]) {
      const standard = sourceStandardValue(text,group);
      if (standard) return standard;
    }
    if (field === STANDARD_COLUMNS[5]) {
      const pipe = steelPipeTriple(text,group,material);
      if (pipe?.thickness) return `T${pipe.thickness}`;
      const range = this.rangeValue(text); if (range) return range;
    }
    if (field === STANDARD_COLUMNS[6]) {
      const installType = sourceInstallType(text);
      if (installType) return installType;
    }
    const rows = this.masterByGroupMaterial.get(`${fold(group)}|${fold(material)}`) || [];
    if (!rows.length) return "";
    const direct = best(text, rows.filter(row => cell(row,field)), row => cell(row,field), row => cell(row,field));
    return direct;
  }
  rangeValue(text) {
    // Dây/cáp: chấp nhận cả "0.6/1kV", "0.6 / 1 kV" và thứ tự thông số
    // bị đảo; luôn trả về một cách ghi thống nhất.
    const voltage = String(text ?? "").match(/\b(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)\s*k\s*v\b/i);
    if (voltage) return `${voltage[1].replace(",",".")}/${voltage[2].replace(",",".")}kV`;
    // Một số nguồn nhập nhầm dấu nhân thay cho dấu gạch chéo trong cấp
    // điện áp (600x1000V). Hậu tố V làm ngữ cảnh đủ rõ, không ảnh hưởng
    // dấu x trong tiết diện 4x16mm².
    const voltageInVolts = String(text ?? "").match(/\b(\d+)\s*[\/xX×]\s*(\d+)\s*v\b/i);
    if (voltageInVolts) {
      if (voltageInVolts[1] === "600" && voltageInVolts[2] === "1000") return "0.6/1kV";
      return `${voltageInVolts[1]}/${voltageInVolts[2]}V`;
    }
    const pairedThickness = String(text ?? "").match(/\bT\s*(\d+(?:[.,]\d+)?)\s*\/\s*(?:T\s*)?(\d+(?:[.,]\d+)?)\b/i);
    if (pairedThickness) return `T${normalizeDimensionNumber(pairedThickness[1])}/T${normalizeDimensionNumber(pairedThickness[2])}`;
    // BS 1387 thường được nhà cung cấp ghi hạng M/H/L thay vì tên dải ERP.
    // Chỉ nhận khi có từ khóa hạng/cấp/class để không nhầm M với kích thước.
    const pipeClass = fold(text).match(/\b(?:HANG|CAP|CLASS)\s*([MHL])\b/)?.[1];
    if (pipeClass) return ({M:"Medium",H:"Heavy",L:"Light"})[pipeClass];
    const range = String(text ?? "").match(/\b(?:SCH|PN)\s*\d+(?:[.,]\d+)?\b|\b[AT]\s*\d+(?:[.,]\d+)?\b|\b\d+(?:[.,]\d+)?\s*(?:W\/m|kVA|bar|A|T|W)\b|\b(?:Light|Medium|Heavy)\b/i);
    if (!range) return "";
    const value = range[0].replace(/\s+/g, " ").trim();
    return value.replace(/^([AT])\s*(\d+)[.,]0+$/i, "$1$2");
  }
  hasMasterValue(field, group, material) {
    return (this.masterByGroupMaterial.get(`${fold(group)}|${fold(material)}`) || []).some(row => cell(row,field));
  }
  training(text) { return this.aliasMatrixByName.get(preserve(text)) || this.trainingByName.get(preserve(text)); }
  finishValue(text) {
    text = this.propertyText ?? text;
    const source = fold(text);
    if (/\bKHONG\s+BAC\b/.test(source) || /\bNGOAI\s+KHONG\s+PHU\s+NHOM\b/.test(source)) return "không bạc";
    if (/\bCO\s+BAC\b/.test(source) || /\bNGOAI\s+PHU\s+NHOM\b/.test(source)) return "có bạc";
    const special = FINISH_RULES.find(([term]) => preserve(text).includes(preserve(term)))?.[1]; if (special) return special;
    // Không dùng \b vì ký tự đầu của "đen", "đỏ" không được JavaScript
    // coi là ký tự word, làm màu đứng độc lập bị bỏ sót.
    if (/(?:^|[^\p{L}\p{N}])màu\s+bạc(?=$|[^\p{L}\p{N}])/iu.test(String(text ?? ""))) return "màu bạc";
    const color = String(text ?? "").match(/(?:^|[^\p{L}\p{N}])(?:màu\s+)?(vàng\s+xanh|trắng|đen|đỏ|cam|vàng|xanh lá|xanh lam|xanh dương|xám)(?=$|[^\p{L}\p{N}])/iu);
    return color ? `màu ${color[1].toLocaleLowerCase("vi")}` : "";
  }
  dimension(text, group, material = "") {
    text = this.propertyText ?? text;
    const compact = String(text ?? "").replace(/\s+/g," ").trim();
    // Dây/cáp: tiết diện lõi có dạng 1x1.5mm2, 3x2.5 mm²... không áp dụng
    // quy tắc DN/D của ống, cần giữ đúng số lõi và tiết diện.
    const cableCore = compact.match(/\b(\d+)\s*[xX×]\s*(\d+(?:[.,]\d+)?)\s*\)?\s*mm\s*(?:2|²)?(?![\p{L}\p{N}])/iu);
    if (cableCore && (electricalDomain(compact).endsWith("CABLE") || electricalDomain(`${group} ${material}`).endsWith("CABLE"))) {
      return {value:`${cableCore[1]}x${normalizeDimensionNumber(cableCore[2])}mm²`,trusted:true};
    }
    const threeAxisBox = /HOP NOI DAY TRUNG GIAN|DE AM/i.test(fold(material));
    if (threeAxisBox) {
      const axes = compact.match(/\b(\d+(?:[.,]\d+)?)\s*[*xX×]\s*(\d+(?:[.,]\d+)?)\s*[*xX×]\s*(\d+(?:[.,]\d+)?)\b/);
      if (axes) return {value:`${axes[1]}x${axes[2]}x${axes[3]}`,trusted:true};
    }
    if (/MAT CHE DE AM/i.test(fold(material))) {
      const axes = compact.match(/\b(\d+(?:[.,]\d+)?)\s*[*xX×]\s*(\d+(?:[.,]\d+)?)\b/);
      if (axes) return {value:`${normalizeDimensionNumber(axes[1])}x${normalizeDimensionNumber(axes[2])}`,trusted:true};
    }
    const steelPipe = steelPipeTriple(compact,group,material);
    if (steelPipe) {
      const candidates = this.pipeOutsideByGroup.get(fold(group)) || [];
      let nearest = null;
      for (const candidate of candidates) {
        const difference = Math.abs(candidate.outside - steelPipe.outside);
        if (!nearest || difference < nearest.difference) nearest = {...candidate,difference};
      }
      const tolerance = Math.max(1.5,steelPipe.outside * .015);
      if (nearest && nearest.difference <= tolerance) return {value:`DN${nearest.nominal}`,trusted:true,enforced:true};
    }
    const businessDimension = materialDimensionRule(compact,group,material);
    if (businessDimension) return businessDimension;
    // Z18/Z27 trong mô tả ống gió là cấp mạ Z180/Z275, không phải kích
    // thước. Trả kết quả cưỡng chế rỗng để Alias cũ không chèn Z18 trở lại.
    if (/ONG GIO TON/i.test(fold(group)) && /\bZ\s*(?:18|27|80|120|180|275)\b/i.test(compact)
      && !/\b(?:DN|D|M|W|H|L)\s*\d/i.test(compact)) return {value:"",trusted:true,enforced:true};
    const part = "(?:(?:DN|D|M|W|H|L|Z)\\s*\\d+(?:[.,]\\d+)?)";
    const length = compact.match(/\bL\s*\d+(?:[.,]\d+)?\b/i);
    const labelled = compact.match(/\b(?:W|H|L|Z)\s*\d+(?:[.,]\d+)?(?:\s*[xX×\/,]\s*(?:W|H|L|Z)\s*\d+(?:[.,]\d+)?)*\b/i);
    const singleLength = labelled && /^L\s*\d+(?:[.,]\d+)?$/i.test(labelled[0]);
    if (labelled && !singleLength) {
      const normalizedLabelled = [...labelled[0].matchAll(/([WHLZ])\s*(\d+(?:[.,]\d+)?)/gi)]
        .map(item => `${item[1].toUpperCase()}${normalizeDimensionNumber(item[2])}`).join("x");
      const hasWidthHeight = /W\s*\d+.*H\s*\d+/i.test(labelled[0]);
      if (length && hasWidthHeight && !labelled[0].includes(length[0])) return {value:`${normalizedLabelled}x${length[0].replace(/\s+/g,"")}`,trusted:true};
      return {value:normalizedLabelled || labelled[0],trusted:true};
    }
    const complex = compact.match(new RegExp(`\\b${part}(?:\\s*[xX×]\\s*${part}){1,2}\\b`,"i"));
    if (complex) return {value:complex[0],trusted:true};
    const diameter = compact.match(/\bDN\s*\d+(?:[.,]\d+)?\b|\bD\s*\d+(?:[.,]\d+)?\b/i);
    const metric = compact.match(/\bM\s*\d+(?:[.,]\d+)?\b/i);
    if (diameter && length) return {value:`${diameter[0].replace(/\s+/g,"")}x${length[0].replace(/\s+/g,"")}`,trusted:true};
    if (diameter && metric) return {value:`${diameter[0].replace(/\s+/g,"")}x${metric[0].replace(/\s+/g,"")}`,trusted:true};
    if (metric && length) return {value:`${metric[0].replace(/\s+/g,"")}x${length[0].replace(/\s+/g,"")}`,trusted:true};
    if (diameter) {
      const numeric = diameter[0].match(/\d+(?:[.,]\d+)?/)[0];
      return {value:/UPVC/i.test(fold(group)) ? `D${numeric}` : diameter[0],trusted:true};
    }
    const diameterPhi = compact.match(/\b(?:PHI|Ø)\s*(\d+(?:[.,]\d+)?)\s*(?:MM)?\b/i)
      || compact.match(/(?:^|[^\d.,])(\d+(?:[.,]\d+)?)\s*MM(?!\s*(?:2|²))/i);
    if (diameterPhi && /PVC|ONG\b/i.test(fold(group))) return {value:/UPVC/i.test(fold(group)) ? `D${diameterPhi[1]}` : `DN${diameterPhi[1]}`,trusted:true};
    const prefixed = compact.match(/\b(?:M|W|H|L|Z)\s*\d+(?:[.,]\d+)?\b/i);
    if (!prefixed) return {value:"",trusted:true};
    const value = prefixed[0];
    if (!/^m\s*\d/i.test(value)) return {value,trusted:true};
    let rows = this.data.KICH_THUOC || [];
    if (group) rows = rows.filter(row => !cell(row,"Nhóm vật tư") || preserve(cell(row,"Nhóm vật tư")).includes(preserve(group)));
    const catalogValue = best(value,rows,row => cell(row,"Mô tả","Kích thước danh nghĩa"),row => cell(row,"Mô tả","Kích thước danh nghĩa"));
    return {value,trusted:!!catalogValue};
  }
  lookup(field, text, group) {
    text = this.propertyText ?? text;
    const source = {"Kích thước":["KICH_THUOC","Mô tả"],"Dải thông số kỹ thuật":["DAI_THONG_SO","Mô tả"],"Tiêu chuẩn":["TIEU_CHUAN","Tên tiêu chuẩn"],"Kiểu lắp đặt":["KIEU_LAP_DAT","Tên kiểu lắp đặt"],"Hoàn thiện":["HOAN_THIEN","Tên hoàn thiện"]}[field];
    if (!source) return "";
    let rows = this.data[source[0]] || [];
    if (group) rows = rows.filter(row => !cell(row,"Nhóm vật tư") || fold(cell(row,"Nhóm vật tư")).includes(fold(group)));
    return best(text, rows, row => cell(row,source[1],"Mô tả"), row => cell(row,source[1]));
  }
  normalize(raw, identity = raw, groupHint = "", materialHint = "") {
    const attributeText = String(raw ?? "").trim(), identityText = String(identity ?? "").trim(), hintText = String(groupHint ?? "").trim(), materialHintText = String(materialHint ?? "").trim(), memoKey = `${preserve(attributeText)}\u0000${preserve(identityText)}\u0000${preserve(hintText)}\u0000${preserve(materialHintText)}`;
    const cached = this.memo.get(memoKey); if (cached) return {result:{...cached.result},uncertain:[...cached.uncertain],sourceDerived:{...(cached.sourceDerived || {})},erpIssues:[...(cached.erpIssues || [])]};
    raw = identityText; this.propertyText = attributeText;
    const text = String(raw ?? "").trim();
    const enforcedMaterial = explicitBusinessMaterial(text) || explicitBusinessMaterial(attributeText);
    const ambiguousMaterial = ambiguousBusinessMaterial(text) || ambiguousBusinessMaterial(attributeText);
    const enforcedGroup = (enforcedMaterial ? this.groupForMaterial(enforcedMaterial) : "")
      || explicitBusinessGroup(text) || explicitBusinessGroup(attributeText);
    const exactMatrix = this.aliasMatrixByKey.get(fold(text)) || this.aliasMatrixByName.get(preserve(text));
    const matrixAlias = exactMatrix && compatibleMatrixRow(text,exactMatrix) ? exactMatrix : null;
    const relatedCandidate = matrixAlias || this.aliasMatrixByStableKey.get(stableAliasKey(text)) || relatedMatrixByTokens(text,this.relatedAliasTokenIndex);
    const relatedAlias = relatedCandidate && compatibleMatrixRow(text,relatedCandidate) ? relatedCandidate : null;
    const trainingCandidate = this.training(text), trained = relatedAlias || (trainingCandidate && compatibleMatrixRow(text,trainingCandidate) ? trainingCandidate : null), inferredJunction = this.pvcJunction(text), inferredPprThread = this.pprThreadedElbow(text), inferredPprPipe = this.pprPipeByPressure(text);
    const exactGroupCandidate = this.aliasExact.get(`GROUP|${preserve(text)}`) || this.aliasExact.get(`GROUP|${preserve(attributeText)}`) || "";
    const exactAliasGroup = compatibleSourceMaterial(text,exactGroupCandidate) && compatibleElectricalDomain(text,exactGroupCandidate) ? exactGroupCandidate : "";
    const exactMaterialCandidate = this.aliasExact.get(`MATERIAL|${preserve(text)}`) || this.aliasExact.get(`MATERIAL|${preserve(attributeText)}`) || "";
    const exactAliasMaterial = compatibleMaterial(text,exactMaterialCandidate) && compatibleSourceMaterial(text,exactMaterialCandidate) && compatibleElectricalDomain(text,exactMaterialCandidate) ? exactMaterialCandidate : "";
    const manualGroupCandidate = hintText && fold(hintText) !== "THIEU" ? this.group(hintText) || hintText : "";
    // Dữ liệu nhập tay vẫn được giữ, trừ khi mô tả xác định rõ đây là cáp
    // nhưng ô cũ lại thuộc họ Ống luồn dây (kết quả sai của các bản trước).
    const manualGroup = compatibleElectricalDomain(text,manualGroupCandidate) ? manualGroupCandidate : "";
    const trainedGroup = cell(trained || {},"Nhóm vật tư");
    let aliasGroup = "";
    if (!manualGroup && !exactAliasGroup && !trainedGroup && !inferredJunction?.group && !inferredPprThread?.group && !inferredPprPipe?.group) {
      const inferredGroupCandidate = this.alias("GROUP",text) || this.alias("GROUP",attributeText);
      aliasGroup = compatibleSourceMaterial(text,inferredGroupCandidate) && compatibleElectricalDomain(text,inferredGroupCandidate) ? inferredGroupCandidate : "";
    }
    const trustedGroup = enforcedGroup || manualGroup || exactAliasGroup || inferredPprPipe?.group || inferredJunction?.group || inferredPprThread?.group;
    const sourceTrustedGroup = enforcedGroup || exactAliasGroup || inferredPprPipe?.group || inferredJunction?.group || inferredPprThread?.group;
    let group = trustedGroup || trainedGroup || aliasGroup || this.group(text);
    const expectedFamily = protectedMaterialFamily(text);
    // Một tên phụ kiện rõ ràng không được phép kéo sang Nhóm không hề có họ
    // vật tư tương ứng (ví dụ Thông tắc -> hệ thống âm thanh).
    if (group && expectedFamily && !sourceTrustedGroup) {
      const groupRows = this.materialsByGroup.get(fold(group)) || [];
      if (groupRows.length && !groupRows.some(row => compatibleMaterial(text,cell(row,"Tên vật tư","Mô tả")))) group = "";
    }
    const inferredPipeBranch = this.pipeBranchByDimensions(text,group);
    const inferredPipeAccessory = this.pipeNamedAccessory(text,group);
    const manualMaterialSource = materialHintText
      && fold(materialHintText) !== "THIEU"
      && compatibleElectricalDomain(text,materialHintText)
      && compatibleMaterial(text,materialHintText)
      ? materialHintText
      : "";
    const manualMaterialCandidate = manualMaterialSource ? this.material(manualMaterialSource,group) || manualMaterialSource : "";
    const manualMaterial = compatibleElectricalDomain(text,manualMaterialCandidate) ? manualMaterialCandidate : "";
    const trainedMaterial = cell(trained || {},"Vật tư"), safeTrainedMaterial = compatibleMaterial(text,trainedMaterial) ? trainedMaterial : "";
    let aliasMaterial = "";
    if (!manualMaterial && !exactAliasMaterial && !safeTrainedMaterial && !inferredJunction?.material && !inferredPprThread?.material && !inferredPprPipe?.material && !inferredPipeBranch?.material && !inferredPipeAccessory?.material) {
      const inferredMaterialCandidate = this.alias("MATERIAL",text) || this.alias("MATERIAL",attributeText);
      aliasMaterial = compatibleMaterial(text,inferredMaterialCandidate) && compatibleSourceMaterial(text,inferredMaterialCandidate) && compatibleElectricalDomain(text,inferredMaterialCandidate) ? inferredMaterialCandidate : "";
    }
    const pipeAccessoryNeedsContext = new Set(["Y","Y_DEU","Y_THU","TE","TE_DEU","TE_THU","TE_CONG_DEU","TE_CONG_THU","THONG_TAC","CUT","CHECH"]);
    const allowGlobalMaterialSearch = !!group || sourceMaterials(`${text} ${attributeText}`).length > 0 || !pipeAccessoryNeedsContext.has(expectedFamily);
    let material = enforcedMaterial || manualMaterial || exactAliasMaterial || inferredPprPipe?.material || inferredPipeBranch?.material || inferredPipeAccessory?.material || safeTrainedMaterial || inferredJunction?.material || inferredPprThread?.material || aliasMaterial || (allowGlobalMaterialSearch ? this.material(text,group) || this.material(attributeText,group) : "");
    // Một số mô tả xác định được họ/nhóm nhưng chưa đủ thuộc tính để chọn
    // duy nhất một Vật tư ERP (inox 304/316, hộp chia mấy ngả, cút/kẹp loại
    // nào...). Không dùng kết quả dò gần đúng để đoán trong các trường hợp đó.
    if (ambiguousMaterial && !enforcedMaterial && !exactAliasMaterial && !matrixAlias) material = "";
    if (!group && material) group = this.groupForMaterial(material);
    material = this.materialByDimensionForm(text,group,material);
    // A complete catalog name at the start of the source wins over a fuzzy
    // cover match ("máng ... kèm nắp" is not a standalone "nắp máng").
    if (fold(group).startsWith("MANG PHU KIEN")) {
      const exactTrayNames = (this.materialsByGroup.get(fold(group)) || [])
        .map(row => cell(row,"Tên vật tư","Mô tả"))
        .filter(name => name && (preserve(text) === preserve(name) || preserve(text).startsWith(preserve(name) + " ")))
        .sort((a,b) => b.length - a.length);
      if (exactTrayNames.length) material = exactTrayNames[0];
    }
    const requirementSet = this.requirements(material), requirements = requirementSet.fields;
    const result = Object.fromEntries(STANDARD_COLUMNS.map(header => [header,matrixAlias ? cell(matrixAlias,header) : ""])); result["Nhóm vật tư"] = group; result["Vật tư"] = material;
    const confirmedTechnical = this.alias(`FIELD:${STANDARD_COLUMNS[2]}`,text) || this.alias(`FIELD:${STANDARD_COLUMNS[2]}`,attributeText);
    if (confirmedTechnical) result[STANDARD_COLUMNS[2]] = confirmedTechnical;
    const dimension = this.dimension(text,group,material);
    // Alias ma trận chính xác là quyết định đã được người dùng duyệt. Ví dụ
    // 70x70 -> 72x72 không được bộ đọc kích thước nguồn đổi ngược lại.
    const approvedAliasDimension = matrixAlias ? cell(matrixAlias,"Kích thước") : "";
    const sourceDerived = {"Kích thước":approvedAliasDimension || (dimension.value && dimension.trusted ? dimension.value : "")}; let dimensionUncertain = false;
    if (!group || !material) {
      for (const header of STANDARD_COLUMNS.slice(2)) result[header] = "";
      // DN/D/W/H/Z là dữ liệu cấu trúc có thể tin cậy độc lập với Alias.
      // Giữ kích thước đã đọc được thay vì xóa theo Nhóm/Vật tư còn thiếu.
      if (dimension.value && dimension.trusted) result[STANDARD_COLUMNS[3]] = dimension.value;
      // Tiêu chuẩn và dải ghi đích danh trong nguồn vẫn là dữ liệu chắc chắn.
      // Không làm mất BS 1387 / Medium chỉ vì bước nhận diện Vật tư thất bại.
      const explicitStandard = sourceStandardValue(attributeText || text,group);
      const explicitRange = this.rangeValue(attributeText || text);
      if (explicitStandard) result[STANDARD_COLUMNS[4]] = explicitStandard;
      if (explicitRange) result[STANDARD_COLUMNS[5]] = explicitRange;
      const response = {result, uncertain:[!group ? STANDARD_COLUMNS[0] : null,!material ? STANDARD_COLUMNS[1] : null].filter(Boolean),sourceDerived,erpIssues:this.erpIssues(result,attributeText)}; this.memo.set(memoKey,response); return {result:{...response.result},uncertain:[...response.uncertain],sourceDerived:{...sourceDerived},erpIssues:[...response.erpIssues]};
    }
    for (const field of REQUIRED) if (field !== "Nhóm vật tư" && field !== "Vật tư" && (field === "Quy cách đóng gói" ? requirementSet.hasMatrix && requirements[field] : requirements[field] || !requirementSet.hasMatrix)) {
      const master = this.masterValue(field,text,group,material);
      const confirmed = this.alias(`FIELD:${field}`,text) || this.alias(`FIELD:${field}`,attributeText);
      if (field === "Quy cách đóng gói") { result[field] = result[field] || confirmed; continue; }
      result[field] = result[field] || confirmed || (field === "Hoàn thiện" ? this.finishValue(text) : "") || (field === "Kích thước" && dimension.value ? dimension.value : "") || master || (field === "Kích thước" ? dimension.value : this.lookup(field,text,group));
      if (field === "Kích thước" && !master && dimension.value && !dimension.trusted) dimensionUncertain = true;
    }
    // MATRIX là cổng nghiệp vụ; ngoại lệ duy nhất là Thông số kỹ thuật khác đã được người dùng xác nhận qua Alias.
    if (requirementSet.hasMatrix) for (const field of REQUIRED) {
      const keepConfirmedTechnical = field === STANDARD_COLUMNS[2] && !!confirmedTechnical;
      if (field !== "Nhóm vật tư" && field !== "Vật tư" && !requirements[field] && !keepConfirmedTechnical) result[field] = "";
    }
    // Các quy tắc kích thước nghiệp vụ mới là bắt buộc và sửa được cả Alias
    // cũ có kích thước sai; không để dữ liệu ma trận ghi đè ngược trở lại.
    if (dimension.enforced) {
      result["Kích thước"] = dimension.value;
      dimensionUncertain = !dimension.trusted;
    }
    // Tiêu chuẩn xuất hiện rõ trong nguồn phải thắng Alias cũ. Không để
    // ANSI/ASME/ASTM bị một ma trận gần đúng đổi thành EN hoặc BS.
    const explicitStandard = sourceStandardValue(attributeText || text,group);
    if (explicitStandard && (!requirementSet.hasMatrix || requirements["Tiêu chuẩn"])) result["Tiêu chuẩn"] = explicitStandard;
    const explicitInstall = sourceInstallType(attributeText || text);
    if (explicitInstall && (!requirementSet.hasMatrix || requirements["Kiểu lắp đặt"])) result["Kiểu lắp đặt"] = explicitInstall;
    // Màu ghép trong mô tả nguồn là dấu hiệu rõ ràng hơn Alias/ma trận cũ.
    // Không để "vàng xanh" bị khớp một phần và ghi thành "màu vàng".
    const explicitFinish = this.finishValue(text);
    if (explicitFinish && (!requirementSet.hasMatrix || requirements["Hoàn thiện"])) result["Hoàn thiện"] = explicitFinish;
    if (!result["Quy cách đóng gói"]) result["Quy cách đóng gói"] = defaultPackaging(material,result["Kích thước"]);
    const uncertain = [];
    if (!group) uncertain.push("Nhóm vật tư");
    if (!material) uncertain.push("Vật tư");
    for (const field of REQUIRED) {
      if (field === "Nhóm vật tư" || field === "Vật tư" || result[field]) continue;
      if ((requirementSet.hasMatrix && requirements[field]) || (field !== "Quy cách đóng gói" && !requirementSet.hasMatrix && this.hasMasterValue(field,group,material))) uncertain.push(field);
    }
    if (dimensionUncertain && !uncertain.includes("Kích thước")) uncertain.push("Kích thước");
    const response = {result,uncertain,sourceDerived,erpIssues:this.erpIssues(result,attributeText)}; this.memo.set(memoKey,response); return {result:{...response.result},uncertain:[...response.uncertain],sourceDerived:{...sourceDerived},erpIssues:[...response.erpIssues]};
  }
}

const MATERIAL_MARKER = /\b(?:PPR|UPVC|CPVC|HDPE|PEX|PVC|INOX|GANG|DONG|THEP)\b/;
const dimensionNumbers = value => [...String(value ?? "").matchAll(/\d+(?:[.,]\d+)?/g)].map(match => normalizeDimensionNumber(match[0]));
const contextualDimensionNumbers = (entry, source) => {
  // Với phụ kiện ống, đọc trực tiếp mô tả để không đánh mất đường kính thứ
  // hai khi lượt chuẩn hóa đầu tiên mới chỉ trả D140 từ D140/114.
  const pipeValues = pipeDiameterValues(source);
  if (pipeValues.length) return pipeValues;
  return [...new Set([
    ...dimensionNumbers(entry?.sourceDerived?.["Kích thước"]),
    ...dimensionNumbers(entry?.result?.["Kích thước"]),
    ...dimensionNumbers(source),
  ])];
};

export function normalizeMaterialBatch(normalizer, items = []) {
  const initial = items.map(item => normalizer.normalize(
    String(item?.attributeText || ""),
    String(item?.identityText || item?.attributeText || ""),
    String(item?.groupHint || ""),
    String(item?.materialHint || ""),
  ));
  const analyzed = initial.map((entry,index) => {
    const group = cell(entry.result || {},"Nhóm vật tư"), material = cell(entry.result || {},"Vật tư");
    const item = items[index] || {};
    const contextGroup = fold(item.contextGroupHint) === "THIEU" ? "" : String(item.contextGroupHint || "").trim();
    const contextMaterial = fold(item.contextMaterialHint) === "THIEU" ? "" : String(item.contextMaterialHint || "").trim();
    const contextMaterialGroup = contextMaterial ? normalizer.groupForMaterial(contextMaterial) : "";
    const resultMaterialGroup = normalizer.groupForMaterial(material);
    const source = String(item.identityText || item.attributeText || ""), hasExplicitMaterial = MATERIAL_MARKER.test(fold(source));
    const resultValid = group && material && fold(group) === fold(resultMaterialGroup);
    const contextValid = contextGroup && contextMaterialGroup && fold(contextGroup) === fold(contextMaterialGroup);
    return {
      entry,index,group,material,
      // Kết quả dò gần đúng từ một mô tả không ghi vật liệu không đủ tin cậy
      // để quyết định Nhóm cho cả vùng. Nếu cho phép, một dòng Y thu nhận nhầm
      // HDPE có thể làm vô hiệu hàng chục dòng uPVC đúng ở ngay phía trên.
      voteGroup:contextValid ? contextGroup : resultValid && hasExplicitMaterial ? group : "",
    };
  });
  const valid = analyzed.filter(item => item.voteGroup);
  const trustedGroups = new Set(valid.map(item => fold(item.voteGroup)));
  const uniformTrustedGroup = valid.length >= 3 && trustedGroups.size === 1 ? valid[0].voteGroup : "";
  return initial.map((entry,index) => {
    const item = items[index] || {}, source = String(item.identityText || item.attributeText || ""), sourceKey = fold(source);
    if (MATERIAL_MARKER.test(sourceKey)) return entry;
    const rowDimensions = contextualDimensionNumbers(entry,source);
    if (!rowDimensions.length) return entry;
    const nearby = valid.map(anchor => {
      const anchorSource = String(items[anchor.index]?.identityText || items[anchor.index]?.attributeText || "");
      const dimensions = contextualDimensionNumbers(anchor.entry,anchorSource);
      return {...anchor,distance:Math.abs(anchor.index - index),sharesDimension:rowDimensions.some(value => dimensions.includes(value))};
    }).filter(anchor => anchor.sharesDimension).sort((left,right) => left.distance - right.distance);
    if (!nearby.length) return entry;
    // Xét tối đa các dòng gần nhất để không truyền Nhóm qua một vùng dữ liệu
    // khác ở xa. Hai bằng chứng cùng Nhóm là đủ; một bằng chứng chỉ được dùng
    // khi nằm sát dòng cần chuẩn hóa.
    const evidence = nearby.filter(anchor => anchor.distance <= 80).slice(0,8);
    const counts = new Map();
    for (const anchor of evidence) counts.set(anchor.voteGroup,(counts.get(anchor.voteGroup) || 0) + 1);
    const ranked = [...counts].sort((left,right) => right[1] - left[1]);
    const [dominant = "", dominantCount = 0] = ranked[0] || [];
    const confident = dominant && (
      dominantCount >= 2 && (ranked.length === 1 || dominantCount > ranked[1][1])
      || dominantCount === 1 && (evidence[0]?.distance <= 3 || fold(dominant) === fold(uniformTrustedGroup))
    );
    if (!confident) return entry;
    const group = cell(entry.result || {},"Nhóm vật tư"), material = cell(entry.result || {},"Vật tư"), materialGroup = normalizer.groupForMaterial(material);
    if (fold(group) === fold(dominant) && material && fold(materialGroup) === fold(dominant)) return entry;
    return normalizer.normalize(String(item.attributeText || ""),source,dominant,"");
  });
}

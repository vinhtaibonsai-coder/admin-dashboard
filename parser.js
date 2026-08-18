(() => {
  // =========================================================================
  // LOCAL COMPUTER PARSER - Bộ tách đơn hàng ngoại tuyến bằng thuật toán
  // =========================================================================

  const OrderProcessor = {
    parseCOD(text) {
      if (!text) return 0;
      let s = text.toLowerCase().replace(/\s+/g, '');

      s = s.replace(/^(?:cod|tiền|tien|thu\s*hộ|thuho|thu\s*ho|tiềncod|tienco)[:\-\s]*/i, '');

      let normalized = s.replace(/,/g, '.');
      if (normalized.includes('tr')) {
        const trIndex = normalized.indexOf('tr');
        const afterTr = normalized.substring(trIndex + 2);
        const cleanAfterTr = afterTr.replace(/k/g, '');
        const cleanNormalized = normalized.substring(0, trIndex + 2) + cleanAfterTr;

        let parts = cleanNormalized.split('tr');
        const numBeforeTr = (parts[0].match(/[\d.]+$/) || [''])[0];
        let val = parseFloat(numBeforeTr) || 0;
        if (parts[1]) {
          const suffix = parts[1].replace(/\D/g, '');
          if (suffix.length === 1) {
            val += parseFloat('0.' + suffix);
          } else if (suffix.length === 2) {
            val += parseFloat('0.' + suffix);
          } else if (suffix.length === 3) {
            val += parseFloat('0.' + suffix);
          }
        }
        return Math.round(val * 1000000);
      }

      if (s.includes('k')) {
        let raw = s.replace(/k/g, '').replace(/,/g, '.');
        const numMatch = raw.match(/[\d.]+/);
        if (!numMatch) return 0;
        raw = numMatch[0];
        const grouped = /^\d{1,3}(?:\.\d{3})+$/.test(raw);
        if (grouped) {
          const digits = raw.replace(/\./g, '');
          return Number(digits) * 1000;
        }
        const decimal = parseFloat(raw);
        if (!isNaN(decimal)) {
          return Math.round(decimal * 1000);
        }
        const digitsOnly = raw.replace(/\D/g, '');
        return digitsOnly ? parseInt(digitsOnly, 10) * 1000 : 0;
      }

      const digits = normalized.replace(/\D/g, '');
      return digits ? parseInt(digits, 10) : 0;
    },

    extractPhoneNumbers(text) {
      if (!text) return [];
      const normalized = text.replace(/[\u00A0]/g, ' ');
      const unique = [];

      const pushPhone = (phone) => {
        let clean = phone.replace(/\D/g, '');
        if (clean.startsWith('84') && clean.length > 10) {
          clean = '0' + clean.slice(2);
        }
        if (clean && !unique.includes(clean) && (clean.length === 10 || clean.length === 11)) {
          unique.push(clean);
        }
      };

      const phoneRegex = /(?:\+84|84|0)(?:\s*[\.\-]?\s*\d){9,10}\b/g;
      let match;
      while ((match = phoneRegex.exec(normalized)) !== null) {
        const matchedStr = match[0];
        const matchIndex = match.index;
        
        if (matchIndex > 0 && /\d/.test(normalized[matchIndex - 1])) {
          continue;
        }
        pushPhone(matchedStr);
      }

      const longMatches = normalized.match(/\b0\d{19,43}\b/g) || [];
      longMatches.forEach(longPhone => {
        const clean = longPhone.replace(/\D/g, '');
        const segments = OrderProcessor.segmentPhoneDigits(clean);
        segments.forEach(pushPhone);
      });

      return unique;
    },

    segmentPhoneDigits(digits) {
      function helper(str) {
        if (str.length === 0) return [];
        if (str[0] !== '0') return null;
        for (const len of [10, 11]) {
          if (str.length >= len) {
            const rest = str.slice(len);
            if (rest.length === 0 || rest[0] === '0') {
              const result = helper(rest);
              if (result !== null) return [str.slice(0, len)].concat(result);
            }
          }
        }
        return null;
      }
      return helper(digits) || [];
    },

    preprocessText(text) {
      if (!text) return "";
      let s = text.trim();

      // Nếu văn bản chỉ có 1 dòng (hoặc không có dấu ngắt dòng) nhưng dài và có nhiều thông tin
      const lines = s.split(/\r?\n/).filter(l => l.trim().length > 0);
      if (lines.length <= 2) {
        s = s.replace(/;\s*/g, '\n');
        s = s.replace(/(?:^|\s+)(?:sđt|sdt|đt|dt|tel|phone|lh)[:\s]*((?:\+84|84|0)(?:\s*[\.\-]?\s*\d){9,10}\b)/gi, '\nSđt:$1');
        s = s.replace(/(?:^|\s+)((?:\+84|84|0)(?:\s*[\.\-]?\s*\d){9,10}\b)/g, '\n$1');
        s = s.replace(/(?:^|\s+)(địa chỉ|đ\/c|dc|address)[:\s]/gi, '\n$1: ');
        s = s.replace(/(?:^|\s+)(khách hàng|người nhận|tên khách|tên kh|khách|tên)[:\s]/gi, '\n$1: ');
        s = s.replace(/(?:^|\s+)(cod|tiền|thu hộ|tiền cod)[:\s]/gi, '\n$1: ');
        s = s.replace(/(?:^|\s+)(mã đơn|mã đh|mã dh|mã vận đơn|mã order|mã)[:\s]/gi, '\n$1: ');
        s = s.replace(/(?:^|\s+)(chỉ\s*thu\s*cước|thu\s*cước|chỉ\s*thu\s*ship|thu\s*ship)[:\s]*/gi, '\n$1');
      }
      return s;
    },

    parseCollectFee(text) {
      if (!text) return false;
      const low = text.toLowerCase();

      // Rule 1: Kiểm tra quy tắc PHỦ ĐỊNH trước (Free ship / Đã thanh toán ship)
      const isNegative = /(?:bên\s*bán\s*chịu\s*ship|freeship|free\s*ship|bao\s*ship|đã\s*ck\s*ship|đã\s*chuyển\s*khoản\s*ship|shop\s*chịu\s*ship|không\s*thu\s*ship|miễn\s*phí\s*ship|miễn\s*phí\s*vận\s*chuyển|k\s*thu\s*ship|ko\s*thu\s*ship|0k\s*ship|k\s*ship|ko\s*ship)/i.test(low);
      if (isNegative) return false;

      // Rule 2: Kiểm tra quy tắc KHẲNG ĐỊNH (Thu cước người nhận)
      const isPositive = /(?:\.\s*cước\s*:\s*có|thu\s*ship\s*:\s*có|thu\s*cước\s*:\s*có|có\s*thu\s*ship|có\s*thu\s*cước|\+\s*cước|\+\s*cuoc|\+\s*phí\s*ship|\+\s*ship|người\s*nhận\s*trả\s*ship|khách\s*trả\s*ship|cước\s*người\s*nhận|chỉ\s*thu\s*cước|thu\s*cước|chỉ\s*thu\s*ship|thu\s*ship)/i.test(low);
      return isPositive;
    },

    extractProductItem(lines) {
      let productItem = "";
      const addressKeywords = /(?:ấp|thôn|xóm|xã|huyện|tỉnh|quận|phường|đường|phố|ngõ|ngách|số\s*nhà|tdp|kp|tổ|đội|buôn|bản|chung\s*cư|tòa|khu|vinhomes|city)/i;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // 1. Kiểm tra trường hợp Sản phẩm nằm ở đầu dòng cùng Địa chỉ (vd: "5kg đỗ quyên 13e/28 trương Văn lực,cam lộ...")
        const combinedMatch = line.match(/^(\d+\s*(?:kg|gram|g|hộp|chai|cái|chiếc|bao|túi|lọ|gói|bịch|set|combo|sp|đôi|bộ)\s+[a-zA-ZÀ-ỹ0-9\s]+?)\s+(?=(?:\d+[a-zA-Z]?\/\d+|số\s*\d+|\b(?:đường|phố|ngõ|ngách|số|thôn|xóm|xã|phường|huyện|quận|tỉnh|tp|ấp|kđt|tòa|chung\s*cư)\b|[a-zA-ZÀ-ỹ\s]+,))/i);
        if (combinedMatch && combinedMatch[1]) {
          productItem = combinedMatch[1].trim();
          lines[i] = line.substring(combinedMatch[1].length).trim();
          break;
        }

        // 2. Kiểm tra dòng đứng độc lập chỉ chứa thông tin sản phẩm (vd: "5kg đỗ quyên")
        if (!addressKeywords.test(line) && !/^(sđt|sdt|đt|dt|tel|phone|lh|cod|tiền|thu\s*hộ|chỉ\s*thu\s*cước|thu\s*cước)/i.test(line)) {
          const match = line.match(/^(\d+\s*(?:kg|gram|g|hộp|chai|cái|chiếc|bao|túi|lọ|gói|bịch|set|combo|sp|đôi|bộ)\s+[a-zA-ZÀ-ỹ0-9\s]+)/i);
          if (match && match[1]) {
            productItem = match[1].trim();
            break;
          }
        }
      }

      return productItem;
    },

    extractOrderCode(text, lines) {
      if (!text) return "";
      const orderCodes = [];

      // Từ khóa nhận diện Mã sản phẩm / SKU (Đồng nghĩa KHÔNG PHẢI mã đơn hàng)
      const skuKeywords = /(?:size|màu|mau|xl|xxl|áo|quần|váy|đầm|hộp|chai|cái|chiếc|bao|túi|lọ|sp|sản\s*phẩm|kg|gram|gói|bịch|set|combo)/i;

      lines.forEach(l => {
        const low = l.toLowerCase();

        // Nếu dòng chứa từ khóa SKU sản phẩm (vd: "Mã áo A102 màu đỏ size L") -> Bỏ qua không lấy mã đơn
        if (skuKeywords.test(low) && !/(?:mã\s*đơn|mã\s*đh|mã\s*dh|mã\s*vận\s*đơn|mã\s*order|order\s*id)/i.test(low)) {
          return;
        }

        // Bắt mã đơn theo tiền tố rõ ràng ("mã:", "mã đơn:", "mã đơn hàng là:", "mã đh:", "order:", "dh:")
        const explicitMatch = l.match(/(?:mã\s*đơn(?:\s*hàng)?(?:\s*là)?|mã\s*đh|mã\s*dh|mã\s*vận\s*đơn|mã\s*order|order\s*id|mã|dh)[:\s\-•]*([a-zA-Z0-9.\-_]{2,25})/i);
        if (explicitMatch && explicitMatch[1]) {
          const candidate = explicitMatch[1].trim();
          if (!/^(hàng|gửi|tới|số|vận|đơn|cước|ship|thu|cod)$/i.test(candidate) && !skuKeywords.test(candidate)) {
            if (!orderCodes.includes(candidate)) orderCodes.push(candidate);
            return;
          }
        }

        // Dòng khớp mã đơn tiêu chuẩn đứng độc lập (vd: "VN123456789", "JT987654321", "DH-2026-001", "Pct369", "K120.106", "a100.139")
        const standaloneMatch = l.match(/\b(VN[0-9]{8,12}|JT[0-9]{8,12}|DH[-_]?[0-9]{3,10}|ORD[-_]?[0-9]{3,10}|[A-Za-z][0-9]{1,4}[\.-][0-9]{1,6}|[A-Za-z]{1,5}[-_]?[0-9]{2,10})\b/i);
        if (standaloneMatch && standaloneMatch[1]) {
          const cand = standaloneMatch[1].trim();
          if (!/\d+k$/i.test(cand) && !/^(ship|cod|vnd|vnđ|kg|g|size)$/i.test(cand) && !skuKeywords.test(cand)) {
            if (!orderCodes.includes(cand)) orderCodes.push(cand);
          }
        }
      });

      return orderCodes.join(', ');
    },

    extractName(lines, phones, rawText) {
      // Từ điển Họ phổ biến ở Việt Nam
      const vnSurnames = /^(nguyễn|trần|lê|phạm|huỳnh|hoàng|vũ|võ|đặng|bùi|đỗ|hồ|ngô|dương|lý|đào|đinh|đoàn|mai|trịnh|thái|phan|cao|vương)\b/i;
      
      // Từ khóa giao tiếp / câu hội thoại không phải Tên
      const chatterKeywords = /(?:freeship|free\s*ship|bao\s*ship|ship|cho\s*mình|gửi\s*cho|cho\s*xin|check\s*inbox|tư\s*vấn|tách\s*ko|hàng\s*dễ\s*vỡ|xem\s*hàng|đã\s*chuyển\s*khoản|chuyển\s*khoản|giao\s*giờ|nhé|nha|ạ|dạ|shop|ơi|\bfb\b|facebook|zalo|tiktok|instagram)/i;

      let candidateName = "";

      // Bước 0: Bắt tên đứng ở đầu câu/dòng trước SĐT (vd: "Phương: 0989.935.936", "Vũ Trang - 0962004039")
      for (const l of lines) {
        if (/^(?:fb|facebook|nick\s*fb|page|zalo|tiktok|ig|instagram)[:\s\-]/i.test(l.trim()) || /^fb\s+/i.test(l.trim())) continue;
        const prefixNameMatch = l.match(/^([a-zA-ZÀ-ỹ\s]{2,35})[:;\-–]\s*(?:sđt|sdt|đt|dt|tel|phone|lh)?\s*(?:\+84|84|0)/i);
        if (prefixNameMatch && prefixNameMatch[1]) {
          let clean = prefixNameMatch[1].trim();
          // Loại bỏ nếu phần bắt match chỉ là nhãn SĐT (vd: "Sdt: 0982...")
          if (/^(?:sđt|sdt|đt|dt|tel|phone|lh|liên\s*hệ|điện\s*thoại)$/i.test(clean)) continue;
          clean = clean.replace(/^(khách\s*hàng|người\s*nhận|khách|tên)[:\s]*/i, '').trim();
          clean = clean.replace(/^[-\|\:\s\.\,\/]+|[-\|\:\s\.\,\/]+$/g, '').trim();
          const isAddress = /(?:ấp|thôn|xóm|xã|huyện|tỉnh|quận|phường|đường|phố|ngõ|ngách|số\s*nhà|tdp|kp)/i.test(clean);
          if (clean.length >= 2 && clean.length <= 40 && !isAddress && !chatterKeywords.test(clean)) {
            return clean;
          }
        }
      }

      // Bước 1: Tìm dòng chứa nhãn tên người nhận rõ ràng ("khách:", "tên:", "người nhận:")
      for (const l of lines) {
        if (/^(?:fb|facebook|nick\s*fb|page|zalo|tiktok|ig|instagram)[:\s\-]/i.test(l.trim()) || /^fb\s+/i.test(l.trim())) continue;
        const nameLabelMatch = l.match(/(?:người\s*nhận\s*hàng|tên\s*khách\s*hàng|người\s*nhận|tên\s*khách|tên\s*kh|khách\s*hàng|họ\s*tên|tên|họ\s*và\s*tên|kh)[:\s\-•]+([^,;\n]+)/i);
        if (nameLabelMatch && nameLabelMatch[1]) {
          let clean = nameLabelMatch[1].trim();
          phones.forEach(p => { clean = clean.replace(p, ''); });
          clean = clean.replace(/^[-\|\:\s\.\,\/]+|[-\|\:\s\.\,\/]+$/g, '').trim();
          if (clean.length >= 2 && clean.length <= 40 && !chatterKeywords.test(clean)) {
            return clean;
          }
        }
      }

      // Bước 2: Tìm dòng bắt đầu bằng Họ tiếng Việt (kể cả khi chung dòng với SĐT/Địa chỉ)
      for (const l of lines) {
        if (/^(?:fb|facebook|nick\s*fb|page|zalo|tiktok|ig|instagram)[:\s\-]/i.test(l.trim()) || /^fb\s+/i.test(l.trim())) continue;
        let clean = l;
        phones.forEach(p => { clean = clean.replace(p, ''); });
        clean = clean.replace(/(?:sđt|sdt|đt|dt|tel|phone|lh|liên\s*hệ)[:\-\s]*/i, '').trim();
        clean = clean.replace(/^[-\|\:\s\.\,\/]+|[-\|\:\s\.\,\/]+$/g, '').trim();

        // Tách phần tên đứng trước ngoặc đơn, dấu phẩy, hoặc tiền tố địa chỉ nếu nằm chung 1 dòng
        let cleanFront = clean.split(/[,\(\-–:]|\b(?:sđt|sdt|đt|dt|tel|phone|lh|địa\s*chỉ|đ\/c|dc|số\s*nhà|thôn|xóm|xã|huyện|tỉnh|quận|phường|đường|phố|ngõ|ngách|ấp)\b/i)[0].trim();

        if (vnSurnames.test(cleanFront)) {
          const words = cleanFront.split(/\s+/);
          if (words.length >= 2 && words.length <= 5 && !chatterKeywords.test(cleanFront)) {
            const isAddress = /thôn|xóm|xã|huyện|tỉnh|quận|phường|đường|phố|ngõ|ngách|số\s*nhà|tdp/i.test(cleanFront);
            if (!isAddress) {
              return cleanFront;
            }
          }
        }
      }

      // Bước 3: Fallback lấy phần tên nằm chung dòng với SĐT (vd: "0901234567 Nguyễn Văn A")
      for (const l of lines) {
        if (/^(?:fb|facebook|nick\s*fb|page|zalo|tiktok|ig|instagram)[:\s\-]/i.test(l.trim()) || /^fb\s+/i.test(l.trim())) continue;
        if (phones.some(p => l.includes(p))) {
          let clean = l;
          phones.forEach(p => { clean = clean.replace(p, ''); });
          clean = clean.replace(/(?:sđt|sdt|đt|dt|tel|phone|lh|liên\s*hệ)[:\-\s]*/i, '').trim();
          clean = clean.replace(/^(ship|gửi|chuyển|cho|xin|khách|tên)[:\s]*/i, '').trim();
          clean = clean.replace(/^[-\|\:\s\.\,\/]+|[-\|\:\s\.\,\/]+$/g, '').trim();

          const isAddress = /thôn|xóm|xã|huyện|tỉnh|quận|phường|đường|phố|ngõ|ngách|số\s*nhà|tdp/i.test(clean);
          const isCodOrCode = /cod|tiền|thu\s*hộ|mã/i.test(clean);

          if (clean && clean.length >= 2 && clean.length <= 35 && !isAddress && !isCodOrCode && !chatterKeywords.test(clean)) {
            return clean;
          }
        }
      }

      // Bước 4: Fallback cuối — lấy dòng đầu tiên không phải SĐT, địa chỉ, COD, mã, tên cửa hàng
      if (!candidateName) {
        const knownLabels = /^(sđt|sdt|đt|dt|tel|phone|lh|địa\s*chỉ|đ\/c|dc|cod|tiền\s*thu\s*hộ|mã\s*đơn|mã\s*vận|mã|order|ship|gửi|cho|kh|tên|fb|facebook|zalo|tiktok|chỉ\s*thu\s*cước|thu\s*cước|cước)/i;
        for (const l of lines) {
          const clean = l.replace(/^[-\|\:\s\.\,\/]+|[-\|\:\s\.\,\/]+$/g, '').trim();
          if (clean && clean.length >= 2 && clean.length <= 50 && !knownLabels.test(clean) && !phones.some(p => clean === p)) {
            const isAddress = /thôn|xóm|xã|huyện|tỉnh|quận|phường|đường|phố|ngõ|ngách|số\s*nhà|tdp/i.test(clean) ||
                              /^\d+[a-zA-Z]?[\/\.-]/.test(clean) ||
                              clean.split(',').filter(part => part.trim().length > 0).length >= 3;
            const isCod = /^(cod|thu\s*hộ|tiền|cước|chỉ\s*thu\s*cước|thu\s*cước|thu\s*ship)/i.test(clean);
            const isNumericOnly = /^\d+$/.test(clean);
            // Lọc dòng chỉ chứa tên địa danh thuần (vd: "Gò Vấp", "Quận 1") không có số nhà
            const isDistrictOnly = /^(gò\s*vấp|bình\s*thạnh|tân\s*bình|thủ\s*đức|quận\s*\d|huyện\s*|tp\.|tphcm|hà\s*nội|đà\s*nẵng)$/i.test(clean);
            if (!isAddress && !isCod && !isNumericOnly && !isDistrictOnly) {
              return clean;
            }
          }
        }
      }

      return candidateName;
    },

    parse(rawInputText) {
      if (!rawInputText) return { name: "", phone: "", address: "không tìm thấy", orderCode: "", productItem: "", codAmount: 0, collectFee: false, extraPhones: [], extraNote: "" };

      // Preprocess text (Xử lý tin nhắn 1 dòng không ngắt dòng)
      const text = OrderProcessor.preprocessText(rawInputText);
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);

      // 1. Trích xuất SĐT
      const phones = OrderProcessor.extractPhoneNumbers(text);
      let phone = phones[0] || "";
      const extraPhones = phones.slice(1);

      // 2. Trích xuất Tiền cước (collectFee) chuẩn xác theo ngữ cảnh
      const collectFee = OrderProcessor.parseCollectFee(text);

      // 3. Trích xuất Mặt hàng / Sản phẩm (vd: "5kg đỗ quyên")
      const productItem = OrderProcessor.extractProductItem(lines);

      // 4. Trích xuất Mã đơn hàng (Phân biệt với SKU Sản phẩm)
      const orderCode = OrderProcessor.extractOrderCode(text, lines);

      // 5. Trích xuất Tên người nhận (Dựa vào Họ VN & từ khóa lọc rác)
      let name = OrderProcessor.extractName(lines, phones, text);

      let address = "";
      let codAmount = 0;
      let extraNote = "";

      // Trích xuất Ghi chú MXH (v.d.: "Fb Trung Jones", "Zalo: Nam")
      lines.forEach(l => {
        const low = l.toLowerCase().trim();
        if (/^(?:fb|facebook|nick\s*fb|page|zalo|tiktok|ig|instagram)[:\s\-]/i.test(low) || /^fb\s+/i.test(low)) {
          if (!extraNote) extraNote = l.trim();
          else if (!extraNote.includes(l.trim())) extraNote += ', ' + l.trim();
        }
      });

      // 6. Duyệt dòng để trích xuất COD và Địa chỉ
      lines.forEach(l => {
        const low = l.toLowerCase();

        // Bỏ qua dòng nếu dòng đó chỉ chứa Tên người nhận và/hoặc Số điện thoại
        let tempLine = l.trim().toLowerCase();
        if (name) {
          tempLine = tempLine.replace(name.toLowerCase().trim(), '');
        }
        phones.forEach(p => {
          tempLine = tempLine.replace(p.toLowerCase().trim(), '');
        });
        tempLine = tempLine.replace(/^(?:sđt|sdt|đt|dt|tel|phone|lh|liên\s*hệ|người\s*nhận|tên\s*khách|khách\s*hàng|tên|họ\s*tên|kh)[:\s\-•,]+/i, '').trim();
        tempLine = tempLine.replace(/^[-\|\:\s\.\,\/]+|[-\|\:\s\.\,\/]+$/g, '').trim();
        if (tempLine.length === 0) {
          return;
        }

        // Trích xuất COD
        if (low.includes('cod') || low.includes('thu hộ') || (low.includes('tiền') && /\d/.test(low))) {
          const parsedCod = OrderProcessor.parseCOD(low);
          if (parsedCod > 0 && codAmount === 0) {
            codAmount = parsedCod;
          }
        }

        // Trích xuất Địa chỉ
        let hasProvinceAlias = false;
        if (typeof ADM_DB !== 'undefined' && ADM_DB.provinces) {
          hasProvinceAlias = ADM_DB.provinces.some(p => {
            return p.aliases.some(a => {
              const regex = new RegExp('\\b' + a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
              return regex.test(low);
            }) || low.includes(p.name.toLowerCase());
          });
        }

        const isAddressByProvince = hasProvinceAlias && (
          /\d/.test(l) || 
          l.includes(',') || 
          /(?<!\p{L})(?:ấp|thôn|xóm|xã|huyện|tỉnh|quận|phường|đường|phố|ngõ|ngách|số\s*nhà|tdp|khu\s*phố|kp|tổ|đội|buôn|bản|chung\s*cư|tòa\s*nhà|tòa|khu\s*đô\s*thị|kđt|vinhomes|city|smart\s*city|dự\s*án|building|block|lô|căn\s*hộ|apartment|villa)(?!\p{L})/iu.test(l) ||
          l.split(/\s+/).length >= 2
        );

        const isAddressLine = (
          low.includes('địa chỉ') || low.includes('đ\/c:') || low.includes('dc:') ||
          /(?<!\p{L})(?:ấp|thôn|xóm|xã|huyện|tỉnh|quận|phường|đường|phố|ngõ|ngách|số\s*nhà|tdp|khu\s*phố|kp|tổ|đội|buôn|bản|chung\s*cư|tòa\s*nhà|tòa|khu\s*đô\s*thị|kđt|vinhomes|city|smart\s*city|dự\s*án|building|block|lô|căn\s*hộ|apartment|villa)(?!\p{L})/iu.test(l) ||
          /^[pq](?:\s|\d)/i.test(l) ||
          l.split(',').filter(part => part.trim().length > 0).length >= 3 ||
          isAddressByProvince
        );

        if (isAddressLine) {
          let ca = l;
          const addressLabelMatch = l.match(/(?:địa\s*chỉ\s*nhận\s*hàng|địa\s*chỉ|đ\/c|dc|address)[:\s\-•]+\s*(.*)/i);
          if (addressLabelMatch && addressLabelMatch[1]) {
            ca = addressLabelMatch[1].trim();
          } else {
            ca = ca.replace(/(?:địa chỉ\s*nhận\s*hàng|địa chỉ|đ\/c|dc|sđt|sdt|đt|dt|tel|phone|lh|liên\s*hệ)\s*:?\s*/gi, '').trim();
          }
          ca = ca.replace(/^(ship|gửi|chuyển|cho|xin)\s+(cho\s+)?(mình|tôi|em)?\s*(về|nhé|tới|đến|với)?\s*/i, '').trim();
          phones.forEach(p => { ca = ca.replace(p, ''); });

          // Chuẩn hóa prefix
          ca = ca.replace(/^Q(?:\.|\s+)(\d+|[a-zA-ZÀ-ỹ][a-zA-ZÀ-ỹ\s]*)/i, (m, g) => 'Quận ' + g.trim());
          ca = ca.replace(/^P(?:\.|\s+)(\d+|[a-zA-ZÀ-ỹ\d][a-zA-ZÀ-ỹ\s\d]*)/i, (m, g) => 'Phường ' + g.trim());
          ca = ca.replace(/^H(?:\.|\s+)([a-zA-ZÀ-ỹ][a-zA-ZÀ-ỹ\s]*)/i, (m, g) => 'Huyện ' + g.trim());
          ca = ca.replace(/^TX(?:\.|\s+)([a-zA-ZÀ-ỹ][a-zA-ZÀ-ỹ\s]*)/i, (m, g) => 'Thị xã ' + g.trim());
          ca = ca.replace(/^TP(?:\.|\s+)([a-zA-ZÀ-ỹ][a-zA-ZÀ-ỹ\s]*)/i, (m, g) => 'TP. ' + g.trim());
          ca = ca.replace(/^X(?:\.|\s+)([a-zA-ZÀ-ỹ][a-zA-ZÀ-ỹ\s]*)/i, (m, g) => 'Xã ' + g.trim());
          ca = ca.replace(/^TT(?:\.|\s+)([a-zA-ZÀ-ỹ][a-zA-ZÀ-ỹ\s]*)/i, (m, g) => 'Thị trấn ' + g.trim());

          ca = ca.replace(/\s+/g, ' ').trim();
          ca = ca.replace(/\s+(?:đơn\s+(?:như\s+này|này)|ko\s+tìm\s+thấy(?:\s+địa\s+chỉ)?|không\s+tìm\s+thấy(?:\s+địa\s+chỉ)?|chưa\s+tìm\s+thấy|xem\s+hàng|kiểm\s+tra\s+hàng|(?:nhé|nha(?!\s+(?:trang|xá|mần|bè|nam|bắc|tây|đông|trung))|nghe|ơi|nhé\s+bạn|ạ))\b.*$/i, '').trim();
          ca = ca.replace(/^[-\s\.\,\/]+|[-\s\.\,\/]+$/g, '').trim();

          if (!address) { address = ca; }
          else if (!address.toLowerCase().includes(ca.toLowerCase())) { address += ", " + ca; }
        } else if (
          // Fallback địa chỉ: bắt đầu bằng số, độ dài >= 12, không phải số lượng sản phẩm, không phải dòng sĐT
          /^\d/.test(l) && /[a-zà-ỹ]/i.test(l) && l.length >= 12 &&
          !/\d+\s*(kg|gói|hộp|thùng|bao|bịch|cái|chiếc|chai|lọ|túi|tấn|yến|lít)\b/i.test(l) &&
          !phones.some(p => l.includes(p)) // Không phải dòng chứa sĐT đã biết
        ) {
          let ca = l.trim();
          phones.forEach(p => { ca = ca.replace(p, ''); });
          if (!address) { address = ca; }
          else if (!address.toLowerCase().includes(ca.toLowerCase())) { address += ", " + ca; }
        } else {
          // Bắt ghi chú trong ngoặc (vd: "(Giao giờ hành chính)")
          const parenMatch = l.match(/\(([^)]+)\)/);
          if (parenMatch && !extraNote) {
            extraNote = parenMatch[1].trim();
          }
        }
      });

      if (!address) address = "không tìm thấy";
      if (phone) phone = phone.replace(/\s+/g, '');

      return { name, phone, address, orderCode, productItem, codAmount, collectFee, extraPhones, extraNote };
    }
  };

  function runLocalComputerParser(text) {
    return OrderProcessor.parse(text);
  }

  function isValidPhoneNumber(phone) {
    if (!phone) return false;
    const clean = phone.toString().replace(/\D/g, '');
    return /^(0\d{9,10})$/.test(clean);
  }

  function normalizePhoneNumber(phone) {
    if (!phone) return "";
    const digits = phone.toString().replace(/\D/g, '');
    if (/^(0\d{9,10})$/.test(digits)) return digits;
    const matches = digits.match(/0\d{9,10}/g) || [];
    if (matches.length > 0) return matches[0];
    if (digits.length >= 10 && digits.startsWith('0')) {
      return digits.length === 11 ? digits.slice(0, 11) : digits.slice(0, 10);
    }
    return "";
  }

  globalThis.OrderProcessor = OrderProcessor;
  globalThis.runLocalComputerParser = runLocalComputerParser;
  globalThis.isValidPhoneNumber = isValidPhoneNumber;
  globalThis.normalizePhoneNumber = normalizePhoneNumber;
})();


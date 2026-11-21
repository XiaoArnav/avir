import React from 'react';

interface CityPanoramicBackdropProps {
  cityId: string;
  skylineColor?: string;
  isDark?: boolean;
  className?: string;
}

export const CityPanoramicBackdrop: React.FC<CityPanoramicBackdropProps> = ({
  cityId,
  skylineColor,
  isDark = false,
  className = 'w-full h-full',
}) => {
  const normalizedId = (cityId || '').toLowerCase();
  const fill = skylineColor || (isDark ? '#F27A55' : '#C4512C');

  // Common floating atmospheric clouds (upper horizon)
  const clouds = (
    <g className="transition-opacity duration-700" style={{ color: fill }}>
      {/* Cloud 1 (Left) */}
      <path
        d="M60 48 C60 36 72 26 88 26 C94 26 100 28 104 32 C110 22 124 16 138 16 C158 16 174 30 176 48 C188 50 198 60 198 72 C198 84 186 94 172 94 L70 94 C54 94 42 82 42 68 C42 56 50 48 60 48 Z"
        fill="currentColor"
        opacity={isDark ? '0.14' : '0.18'}
      />
      {/* Cloud 2 (Center-Right) */}
      <path
        d="M680 38 C680 28 690 20 704 20 C710 20 715 22 719 25 C725 18 736 14 748 14 C765 14 779 26 781 40 C791 42 800 50 800 60 C800 70 790 78 778 78 L690 78 C676 78 665 68 665 56 C665 46 672 38 680 38 Z"
        fill="currentColor"
        opacity={isDark ? '0.12' : '0.15'}
      />
      {/* Cloud 3 (Far Right) */}
      <path
        d="M980 52 C980 40 994 30 1012 30 C1019 30 1026 33 1031 38 C1038 27 1054 20 1070 20 C1094 20 1113 36 1115 56 C1129 58 1140 70 1140 84 C1140 98 1126 110 1110 110 L992 110 C973 110 958 96 958 80 C958 66 967 56 980 52 Z"
        fill="currentColor"
        opacity={isDark ? '0.16' : '0.2'}
      />
      {/* Cloud 4 (Subtle low haze cloud in background) */}
      <path
        d="M340 70 C340 58 354 48 372 48 C378 48 384 50 389 54 C396 44 410 38 424 38 C446 38 463 52 465 70 C477 72 486 82 486 94 C486 106 474 116 460 116 L350 116 C334 116 322 104 322 90 C322 78 330 70 340 70 Z"
        fill="currentColor"
        opacity={isDark ? '0.08' : '0.12'}
      />
    </g>
  );

  // 1. Delhi NCR: Lotus Temple + Qutub Minar + India Gate + Rashtrapati Bhavan / Parliament + Red Fort
  if (normalizedId.includes('delhi')) {
    return (
      <svg
        viewBox="0 0 1200 240"
        preserveAspectRatio="xMidYMax slice"
        className={`${className} transition-all duration-700 pointer-events-none select-none`}
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Delhi NCR architectural skyline silhouette"
      >
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.28' : '0.32'}>
          <path d="M520 240 L520 160 L540 160 L540 148 C540 120 660 120 660 148 L660 160 L680 160 L680 240 Z" fill="currentColor" />
          <path d="M860 240 L860 168 L880 168 L880 152 L910 152 L910 168 L960 168 L960 148 L990 148 L990 168 L1040 168 L1040 140 L1070 140 L1070 168 L1100 168 L1100 240 Z" fill="currentColor" />
          <rect x="0" y="195" width="220" height="45" fill="currentColor" />
          <rect x="740" y="185" width="130" height="55" fill="currentColor" />
        </g>
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />
          {/* LOTUS TEMPLE */}
          <path d="M110 92 C105 130 92 180 62 236 L158 236 C128 180 115 130 110 92 Z" fill="currentColor" />
          <path d="M102 124 C82 148 54 186 32 236 L78 236 C94 195 102 160 106 130 Z" fill="currentColor" />
          <path d="M118 124 C138 148 166 186 188 236 L142 236 C126 195 118 160 114 130 Z" fill="currentColor" />
          <path d="M22 236 L198 236 L186 226 L34 226 Z" fill="currentColor" />
          {/* QUTUB MINAR */}
          <polygon points="234,236 244,72 258,72 268,236" fill="currentColor" />
          <rect x="232" y="192" width="38" height="6" rx="1" fill="currentColor" />
          <rect x="236" y="152" width="30" height="5" rx="1" fill="currentColor" />
          <rect x="240" y="118" width="22" height="5" rx="1" fill="currentColor" />
          <rect x="244" y="88" width="14" height="4" rx="1" fill="currentColor" />
          <path d="M246 72 C246 56 256 56 256 72 Z" fill="currentColor" />
          <line x1="251" y1="56" x2="251" y2="42" stroke="currentColor" strokeWidth="2.5" />
          {/* INDIA GATE */}
          <rect x="340" y="230" width="150" height="6" fill="currentColor" />
          <rect x="348" y="224" width="134" height="6" fill="currentColor" />
          <rect x="356" y="218" width="118" height="6" fill="currentColor" />
          <rect x="362" y="118" width="34" height="100" fill="currentColor" />
          <rect x="434" y="118" width="34" height="100" fill="currentColor" />
          <path d="M396 218 L396 156 C396 130 434 130 434 156 L434 218 Z" fill="currentColor" />
          <rect x="352" y="112" width="126" height="8" rx="1" fill="currentColor" />
          <rect x="360" y="88" width="110" height="24" fill="currentColor" />
          <rect x="372" y="82" width="86" height="6" fill="currentColor" />
          <rect x="388" y="76" width="54" height="6" fill="currentColor" />
          <path d="M404 76 C404 66 426 66 426 76 Z" fill="currentColor" />
          {/* RASHTRAPATI BHAVAN */}
          <rect x="540" y="180" width="240" height="56" fill="currentColor" />
          <rect x="526" y="228" width="268" height="8" fill="currentColor" />
          <polygon points="620,180 660,154 700,180" fill="currentColor" />
          <rect x="632" y="126" width="56" height="28" fill="currentColor" />
          <path d="M632 126 C632 76 688 76 688 126 Z" fill="currentColor" />
          <rect x="656" y="66" width="8" height="10" fill="currentColor" />
          <line x1="660" y1="66" x2="660" y2="48" stroke="currentColor" strokeWidth="3" />
          {/* RED FORT */}
          <path d="M840 236 L840 180 L860 180 L860 162 L900 162 L900 180 L930 180 L930 156 L970 156 L970 180 L1010 180 L1010 150 L1060 150 L1060 180 L1110 180 L1110 162 L1150 162 L1150 180 L1180 180 L1180 236 Z" fill="currentColor" />
          <path d="M936 146 C936 126 964 126 964 146 Z" fill="currentColor" />
          <rect x="1118" y="120" width="24" height="116" fill="currentColor" />
        </g>
      </svg>
    );
  }

  // 2. Patna: The Monumental Golghar Granary + Mahatma Gandhi Setu + Mahavir Mandir
  if (normalizedId.includes('patna')) {
    return (
      <svg
        viewBox="0 0 1200 240"
        preserveAspectRatio="xMidYMax slice"
        className={`${className} transition-all duration-700 pointer-events-none select-none`}
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Patna Golghar and Ganga Setu architectural skyline silhouette"
      >
        {clouds}
        {/* Distant background: Ganga river horizon & Gandhi Setu bridge piers */}
        <g style={{ color: fill }} opacity={isDark ? '0.24' : '0.28'}>
          <rect x="40" y="196" width="460" height="6" fill="currentColor" />
          {/* Bridge piers */}
          <rect x="90" y="202" width="10" height="34" fill="currentColor" />
          <rect x="150" y="202" width="10" height="34" fill="currentColor" />
          <rect x="210" y="202" width="10" height="34" fill="currentColor" />
          <rect x="270" y="202" width="10" height="34" fill="currentColor" />
          <rect x="330" y="202" width="10" height="34" fill="currentColor" />
          <rect x="390" y="202" width="10" height="34" fill="currentColor" />
          <rect x="450" y="202" width="10" height="34" fill="currentColor" />
          {/* Distant river boats & trees */}
          <path d="M480 216 Q495 210 510 216 Z" fill="currentColor" />
          <rect x="980" y="150" width="90" height="86" fill="currentColor" />
        </g>
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />

          {/* 1. MAHAVIR MANDIR & TAKHT SRI PATNA SAHIB (Left, x=40 to x=320) */}
          <rect x="80" y="170" width="120" height="66" fill="currentColor" />
          <path d="M100 170 C100 120 180 120 180 170 Z" fill="currentColor" />
          {/* Kalash and Mandir Flag */}
          <line x1="140" y1="120" x2="140" y2="92" stroke="currentColor" strokeWidth="2.5" />
          <polygon points="140,92 165,102 140,112" fill="currentColor" />
          {/* Side Sikh Gurdwara Dome with Chhatri */}
          <rect x="210" y="150" width="80" height="86" fill="currentColor" />
          <path d="M225 150 C225 118 275 118 275 150 Z" fill="currentColor" />
          <line x1="250" y1="118" x2="250" y2="102" stroke="currentColor" strokeWidth="2" />

          {/* 2. THE MONUMENTAL GOLGHAR (Center, x=380 to x=760) */}
          {/* Wide Stupa Plinth Base */}
          <rect x="400" y="226" width="320" height="10" rx="2" fill="currentColor" />
          <rect x="420" y="218" width="280" height="8" rx="2" fill="currentColor" />
          {/* Massive Beehive Hemispherical Dome (The Golghar) */}
          <path
            d="M430 218 C430 84 690 84 690 218 Z"
            fill="currentColor"
          />
          {/* Twin Outer Spiral Staircases winding around the dome */}
          <path
            d="M432 214 Q520 150 670 120"
            stroke="currentColor"
            strokeWidth="5"
            fill="none"
            opacity="0.4"
          />
          <path
            d="M688 214 Q600 150 450 120"
            stroke="currentColor"
            strokeWidth="5"
            fill="none"
            opacity="0.4"
          />
          {/* Top Viewing Cupola & Observation Deck */}
          <rect x="536" y="80" width="48" height="12" fill="currentColor" />
          <path d="M542 80 C542 64 578 64 578 80 Z" fill="currentColor" />
          <line x1="560" y1="64" x2="560" y2="48" stroke="currentColor" strokeWidth="2.5" />

          {/* 3. MAHATMA GANDHI SETU & PATNA HIGH COURT ARCH (Right, x=800 to x=1180) */}
          {/* Patna High Court Heritage Dome */}
          <rect x="820" y="160" width="160" height="76" fill="currentColor" />
          <polygon points="850,160 900,132 950,160" fill="currentColor" />
          <path d="M876 132 C876 96 924 96 924 132 Z" fill="currentColor" />
          <line x1="900" y1="96" x2="900" y2="78" stroke="currentColor" strokeWidth="2.5" />
          {/* Gandhi Setu Main Spans */}
          <rect x="1000" y="210" width="180" height="8" rx="2" fill="currentColor" />
          <line x1="1040" y1="210" x2="1040" y2="180" stroke="currentColor" strokeWidth="3" />
          <line x1="1120" y1="210" x2="1120" y2="180" stroke="currentColor" strokeWidth="3" />
          <line x1="1040" y1="180" x2="1000" y2="210" stroke="currentColor" strokeWidth="2" opacity="0.6" />
          <line x1="1040" y1="180" x2="1080" y2="210" stroke="currentColor" strokeWidth="2" opacity="0.6" />
          <line x1="1120" y1="180" x2="1080" y2="210" stroke="currentColor" strokeWidth="2" opacity="0.6" />
          <line x1="1120" y1="180" x2="1160" y2="210" stroke="currentColor" strokeWidth="2" opacity="0.6" />
        </g>
      </svg>
    );
  }

  // 3. Varanasi (Kashi / Banaras): Ganga Ghats River Steps + Kashi Vishwanath Golden Shikhara + Riverboats & Chhatris
  if (normalizedId.includes('varanasi') || normalizedId.includes('banaras') || normalizedId.includes('kashi')) {
    return (
      <svg
        viewBox="0 0 1200 240"
        preserveAspectRatio="xMidYMax slice"
        className={`${className} transition-all duration-700 pointer-events-none select-none`}
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Varanasi Ganga Ghats and Kashi Vishwanath architectural skyline silhouette"
      >
        {clouds}
        {/* Distant background: Ganga holy river reflection & temple spires */}
        <g style={{ color: fill }} opacity={isDark ? '0.22' : '0.26'}>
          <polygon points="120,236 140,140 160,236" fill="currentColor" />
          <polygon points="260,236 280,120 300,236" fill="currentColor" />
          <polygon points="880,236 905,110 930,236" fill="currentColor" />
          <polygon points="1040,236 1060,130 1080,236" fill="currentColor" />
        </g>
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />

          {/* 1. ASSI & DASHASHWAMEDH GHAT STEPPED TERRACES (Left, x=20 to x=320) */}
          {/* Stepped stone ghat terraces descending into the Ganga */}
          <rect x="20" y="228" width="300" height="8" fill="currentColor" />
          <rect x="40" y="220" width="260" height="8" fill="currentColor" />
          <rect x="60" y="212" width="220" height="8" fill="currentColor" />
          <rect x="80" y="204" width="180" height="8" fill="currentColor" />
          <rect x="100" y="196" width="140" height="8" fill="currentColor" />
          {/* Priest Ceremonial Wooden Chhatri Umbrella 1 */}
          <path d="M80 180 C80 160 120 160 120 180 Z" fill="currentColor" />
          <line x1="100" y1="180" x2="100" y2="204" stroke="currentColor" strokeWidth="2.5" />
          {/* Priest Ceremonial Wooden Chhatri Umbrella 2 */}
          <path d="M150 172 C150 152 190 152 190 172 Z" fill="currentColor" />
          <line x1="170" y1="172" x2="170" y2="196" stroke="currentColor" strokeWidth="2.5" />
          {/* Bajra Wooden Riverboat on the holy river */}
          <path d="M220 232 Q255 220 290 232 Z" fill="currentColor" />
          <line x1="255" y1="226" x2="255" y2="200" stroke="currentColor" strokeWidth="2" />
          <polygon points="255,200 275,208 255,216" fill="currentColor" opacity="0.6" />

          {/* 2. KASHI VISHWANATH TEMPLE & GOLDEN SHIKHARA (Center, x=360 to x=720) */}
          {/* Sanctum Sanctorum Stone Base */}
          <rect x="380" y="180" width="300" height="56" fill="currentColor" />
          {/* Left Flanking Shikhara */}
          <polygon points="410,180 435,78 460,180" fill="currentColor" />
          <line x1="435" y1="78" x2="435" y2="60" stroke="currentColor" strokeWidth="2.5" />
          <circle cx="435" cy="58" r="3" fill="currentColor" />
          {/* Central Soaring Curvilinear Golden Shikhara */}
          <path
            d="M480 180 C480 110 520 40 530 40 C540 40 580 110 580 180 Z"
            fill="currentColor"
          />
          {/* Amalaka & Golden Kalash Finial with Trishul */}
          <ellipse cx="530" cy="40" rx="14" ry="5" fill="currentColor" />
          <line x1="530" y1="36" x2="530" y2="14" stroke="currentColor" strokeWidth="3" />
          {/* Sacred Trishul (Trident) at pinnacle */}
          <path d="M524 16 L530 10 L536 16" stroke="currentColor" strokeWidth="2" fill="none" />
          {/* Right Flanking Shikhara */}
          <polygon points="600,180 625,78 650,180" fill="currentColor" />
          <line x1="625" y1="78" x2="625" y2="60" stroke="currentColor" strokeWidth="2.5" />

          {/* 3. MANIKARNIKA GHAT & RAMNAGAR FORT RAMPARTS (Right, x=740 to x=1160) */}
          {/* Ramnagar Fort Heavy Stone Ramparts */}
          <path
            d="M750 236 L750 160 L780 160 L780 142 L820 142 L820 160 L860 160 L860 136 L910 136 L910 160 L960 160 L960 145 L1010 145 L1010 160 L1060 160 L1060 140 L1110 140 L1110 160 L1150 160 L1150 236 Z"
            fill="currentColor"
          />
          {/* Riverside Chhatris & Domes */}
          <path d="M790 142 C790 124 810 124 810 142 Z" fill="currentColor" />
          <path d="M875 136 C875 114 895 114 895 136 Z" fill="currentColor" />
          <line x1="885" y1="114" x2="885" y2="98" stroke="currentColor" strokeWidth="2" />
          <path d="M1075 140 C1075 118 1095 118 1095 140 Z" fill="currentColor" />
        </g>
      </svg>
    );
  }

  // 4. Kanpur: JK Temple (Radhakrishna) + Historical Textile Mills ("Manchester of the East") + Ganga Barrage
  if (normalizedId.includes('kanpur') || normalizedId.includes('cawnpore')) {
    return (
      <svg
        viewBox="0 0 1200 240"
        preserveAspectRatio="xMidYMax slice"
        className={`${className} transition-all duration-700 pointer-events-none select-none`}
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Kanpur JK Temple and Manchester of the East industrial skyline silhouette"
      >
        {clouds}
        {/* Distant background: Historic brick chimneys of Kanpur mills */}
        <g style={{ color: fill }} opacity={isDark ? '0.22' : '0.26'}>
          <rect x="80" y="100" width="16" height="140" fill="currentColor" />
          <polygon points="78,100 88,88 98,100" fill="currentColor" />
          <rect x="220" y="120" width="20" height="120" fill="currentColor" />
          <rect x="940" y="110" width="18" height="130" fill="currentColor" />
          <rect x="1050" y="90" width="22" height="150" fill="currentColor" />
        </g>
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />

          {/* 1. HISTORIC TEXTILE MILLS & SAWTOOTH ROOFS (Left, x=40 to x=320) */}
          <polygon points="40,236 40,180 80,150 80,180 120,150 120,180 160,150 160,180 200,150 200,236" fill="currentColor" />
          {/* Main Heritage Industrial Mill Chimney Tower */}
          <polygon points="230,236 238,48 252,48 260,236" fill="currentColor" />
          <rect x="236" y="44" width="18" height="6" fill="currentColor" />
          <rect x="270" y="160" width="60" height="76" fill="currentColor" />

          {/* 2. THE GRAND JK TEMPLE (RADHAKRISHNA MANDIR) (Center, x=360 to x=760) */}
          {/* Neo-Hindu White Marble Mandapam Platform */}
          <rect x="380" y="190" width="360" height="46" fill="currentColor" />
          <rect x="390" y="180" width="340" height="10" fill="currentColor" />
          {/* 5 Distinctive Curvilinear Shikharas (Towers) */}
          {/* Outer Left Shikhara */}
          <path d="M400 180 C400 130 425 80 435 80 C445 80 470 130 470 180 Z" fill="currentColor" />
          <line x1="435" y1="80" x2="435" y2="64" stroke="currentColor" strokeWidth="2" />
          {/* Inner Left Shikhara */}
          <path d="M465 180 C465 110 495 50 505 50 C515 50 545 110 545 180 Z" fill="currentColor" />
          <line x1="505" y1="50" x2="505" y2="34" stroke="currentColor" strokeWidth="2.5" />
          {/* Grand Central Majestic Shikhara */}
          <path d="M530 180 C530 90 565 24 580 24 C595 24 630 90 630 180 Z" fill="currentColor" />
          <line x1="580" y1="24" x2="580" y2="6" stroke="currentColor" strokeWidth="3" />
          <circle cx="580" cy="5" r="3" fill="currentColor" />
          {/* Inner Right Shikhara */}
          <path d="M615 180 C615 110 645 50 655 50 C665 50 695 110 695 180 Z" fill="currentColor" />
          <line x1="655" y1="50" x2="655" y2="34" stroke="currentColor" strokeWidth="2.5" />
          {/* Outer Right Shikhara */}
          <path d="M690 180 C690 130 715 80 725 80 C735 80 760 130 760 180 Z" fill="currentColor" />
          <line x1="725" y1="80" x2="725" y2="64" stroke="currentColor" strokeWidth="2" />

          {/* 3. GANGA BARRAGE GATES & BITHOOR GHATS (Right, x=800 to x=1180) */}
          <rect x="800" y="200" width="360" height="8" rx="2" fill="currentColor" />
          {/* Barrage Lift Sluice Gates */}
          <rect x="830" y="160" width="12" height="40" fill="currentColor" />
          <rect x="870" y="160" width="12" height="40" fill="currentColor" />
          <rect x="910" y="160" width="12" height="40" fill="currentColor" />
          <rect x="950" y="160" width="12" height="40" fill="currentColor" />
          <rect x="990" y="160" width="12" height="40" fill="currentColor" />
          <rect x="1030" y="160" width="12" height="40" fill="currentColor" />
          <rect x="1070" y="160" width="12" height="40" fill="currentColor" />
          {/* Top connecting gantry */}
          <rect x="820" y="156" width="270" height="6" fill="currentColor" />
          {/* Riverside Bithoor Chhatri pavilion */}
          <rect x="1110" y="180" width="50" height="56" fill="currentColor" />
          <path d="M1105 180 C1105 150 1165 150 1165 180 Z" fill="currentColor" />
        </g>
      </svg>
    );
  }

  // 5. Lahore: Badshahi Mosque Triple Domes + Soaring Minarets + Minar-e-Pakistan + Lahore Fort
  if (normalizedId.includes('lahore')) {
    return (
      <svg
        viewBox="0 0 1200 240"
        preserveAspectRatio="xMidYMax slice"
        className={`${className} transition-all duration-700 pointer-events-none select-none`}
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Lahore Badshahi Mosque and Minar-e-Pakistan architectural skyline silhouette"
      >
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.24' : '0.28'}>
          <rect x="80" y="130" width="70" height="110" fill="currentColor" />
          <rect x="1000" y="120" width="90" height="120" fill="currentColor" />
        </g>
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />

          {/* 1. MINAR-E-PAKISTAN (Left, x=60 to x=240) */}
          {/* Stepped Petal Floral Base */}
          <polygon points="90,236 120,200 180,200 210,236" fill="currentColor" />
          {/* Modernist Tapering Fluted Tower */}
          <polygon points="135,200 144,48 156,48 165,200" fill="currentColor" />
          {/* Observation Gallery Balcony */}
          <rect x="140" y="90" width="20" height="6" rx="1" fill="currentColor" />
          {/* Stainless Steel Dome & Crescent Spire */}
          <path d="M144 48 C144 32 156 32 156 48 Z" fill="currentColor" />
          <line x1="150" y1="32" x2="150" y2="16" stroke="currentColor" strokeWidth="2.5" />

          {/* 2. BADSHAHI MOSQUE (Center, x=280 to x=840) */}
          {/* Left Monumental Corner Minaret */}
          <polygon points="300,236 312,42 328,42 340,236" fill="currentColor" />
          <rect x="310" y="160" width="20" height="6" fill="currentColor" />
          <rect x="314" y="100" width="12" height="5" fill="currentColor" />
          <path d="M312 42 C312 24 328 24 328 42 Z" fill="currentColor" />
          <line x1="320" y1="24" x2="320" y2="10" stroke="currentColor" strokeWidth="2.5" />
          {/* Main Prayer Hall Red Sandstone Wall */}
          <rect x="340" y="160" width="440" height="76" fill="currentColor" />
          {/* Central Monumental Pishtaq Archway */}
          <rect x="500" y="110" width="120" height="126" fill="currentColor" />
          <path d="M525 236 L525 160 C525 120 595 120 595 160 L595 236 Z" fill="currentColor" opacity="0.3" />
          {/* Left Bulbous White Marble Dome */}
          <path d="M400 160 C390 100 450 100 440 160 Z" fill="currentColor" />
          <line x1="420" y1="100" x2="420" y2="82" stroke="currentColor" strokeWidth="2.5" />
          {/* Grand Central Bulbous Marble Dome */}
          <path d="M520 110 C500 36 620 36 600 110 Z" fill="currentColor" />
          <line x1="560" y1="36" x2="560" y2="14" stroke="currentColor" strokeWidth="3" />
          {/* Right Bulbous White Marble Dome */}
          <path d="M680 160 C670 100 730 100 720 160 Z" fill="currentColor" />
          <line x1="700" y1="100" x2="700" y2="82" stroke="currentColor" strokeWidth="2.5" />
          {/* Right Monumental Corner Minaret */}
          <polygon points="780,236 792,42 808,42 820,236" fill="currentColor" />
          <rect x="790" y="160" width="20" height="6" fill="currentColor" />
          <path d="M792 42 C792 24 808 24 808 42 Z" fill="currentColor" />
          <line x1="800" y1="24" x2="800" y2="10" stroke="currentColor" strokeWidth="2.5" />

          {/* 3. LAHORE FORT ALAMGIRI GATE (Right, x=860 to x=1160) */}
          <rect x="880" y="140" width="240" height="96" fill="currentColor" />
          {/* Fluted Semiciular Bastions */}
          <path d="M880 236 L880 120 C880 96 930 96 930 120 L930 236 Z" fill="currentColor" />
          <path d="M1070 236 L1070 120 C1070 96 1120 96 1120 120 L1120 236 Z" fill="currentColor" />
          {/* Central Pointed Arch */}
          <path d="M960 236 L960 170 C960 140 1040 140 1040 170 L1040 236 Z" fill="currentColor" opacity="0.3" />
        </g>
      </svg>
    );
  }

  // 6. Beijing: Temple of Heaven + Forbidden City Sweeping Eaves + CCTV Tower (Big Underpants)
  if (normalizedId.includes('beijing') || normalizedId.includes('peking')) {
    return (
      <svg
        viewBox="0 0 1200 240"
        preserveAspectRatio="xMidYMax slice"
        className={`${className} transition-all duration-700 pointer-events-none select-none`}
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Beijing Temple of Heaven and Forbidden City architectural skyline silhouette"
      >
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.22' : '0.26'}>
          {/* Distant Western Hills & Great Wall watchtowers */}
          <polygon points="40,236 120,160 190,236" fill="currentColor" />
          <polygon points="160,236 240,140 320,236" fill="currentColor" />
          <rect x="940" y="110" width="90" height="130" fill="currentColor" />
        </g>
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />

          {/* 1. FORBIDDEN CITY (HALL OF SUPREME HARMONY) (Left, x=40 to x=360) */}
          {/* Triple White Marble Terraces */}
          <rect x="60" y="228" width="280" height="8" fill="currentColor" />
          <rect x="80" y="220" width="240" height="8" fill="currentColor" />
          <rect x="100" y="212" width="200" height="8" fill="currentColor" />
          {/* Lower Red Hall Wall */}
          <rect x="110" y="168" width="180" height="44" fill="currentColor" />
          {/* Lower Sweeping Hip Eaves */}
          <path d="M80 168 Q200 140 320 168 L300 178 Q200 156 100 178 Z" fill="currentColor" />
          {/* Upper Chamber */}
          <rect x="130" y="132" width="140" height="36" fill="currentColor" />
          {/* Upper Grand Sweeping Double Eaves with upturned dragon corners */}
          <path d="M70 132 Q200 96 330 132 L310 142 Q200 114 90 142 Z" fill="currentColor" />
          {/* Ridge Spire Finial */}
          <line x1="200" y1="102" x2="200" y2="82" stroke="currentColor" strokeWidth="3" />

          {/* 2. TEMPLE OF HEAVEN (TIAN TAN) (Center, x=390 to x=760) */}
          {/* Circular Stepped Marble Altar Base */}
          <rect x="420" y="226" width="300" height="10" fill="currentColor" />
          <rect x="450" y="216" width="240" height="10" fill="currentColor" />
          <rect x="480" y="206" width="180" height="10" fill="currentColor" />
          {/* Tier 1 Circular Eaves */}
          <path d="M430 206 Q570 172 710 206 L690 216 Q570 188 450 216 Z" fill="currentColor" />
          <rect x="500" y="174" width="140" height="32" fill="currentColor" />
          {/* Tier 2 Circular Eaves */}
          <path d="M460 174 Q570 140 680 174 L660 184 Q570 156 480 184 Z" fill="currentColor" />
          <rect x="520" y="142" width="100" height="32" fill="currentColor" />
          {/* Tier 3 Conical Pagoda Roof */}
          <path d="M490 142 Q570 96 650 142 Z" fill="currentColor" />
          {/* Golden Gilded Sphere Finial */}
          <circle cx="570" cy="88" r="8" fill="currentColor" />
          <line x1="570" y1="80" x2="570" y2="64" stroke="currentColor" strokeWidth="2.5" />

          {/* 3. CCTV HEADQUARTERS ("BIG UNDERPANTS") & MODERN HIGH-RISES (Right, x=790 to x=1160) */}
          {/* The iconic diagonal cantilever loop */}
          <polygon points="820,236 840,54 890,54 870,236" fill="currentColor" />
          <polygon points="940,236 920,80 970,80 990,236" fill="currentColor" />
          {/* Cantilever bridge connecting the two towers */}
          <polygon points="840,54 980,54 960,110 855,110" fill="currentColor" />
          {/* Modernist Spire High-Rise */}
          <polygon points="1020,236 1020,90 1070,40 1120,90 1120,236" fill="currentColor" />
          <line x1="1070" y1="40" x2="1070" y2="14" stroke="currentColor" strokeWidth="3" />
        </g>
      </svg>
    );
  }

  // 7. Tokyo: Mount Fuji Silhouette + Tokyo Tower / Skytree + Senso-ji Pagoda + Torii Gate
  if (normalizedId.includes('tokyo')) {
    return (
      <svg
        viewBox="0 0 1200 240"
        preserveAspectRatio="xMidYMax slice"
        className={`${className} transition-all duration-700 pointer-events-none select-none`}
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Tokyo Mount Fuji and Tokyo Tower architectural skyline silhouette"
      >
        {clouds}
        {/* Distant background: Majestic Mount Fuji cone with snow cap */}
        <g style={{ color: fill }} opacity={isDark ? '0.28' : '0.32'}>
          <polygon points="40,236 280,72 360,72 600,236" fill="currentColor" />
          {/* Fuji snowy crest cutout */}
          <polygon points="280,72 360,72 390,112 320,95 250,112" fill="currentColor" opacity="0.6" />
          <rect x="980" y="90" width="85" height="150" fill="currentColor" />
        </g>
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />

          {/* 1. TRADITIONAL SHINTO TORII GATE & SENSO-JI PAGODA (Left, x=40 to x=320) */}
          {/* Torii Gate */}
          <rect x="60" y="180" width="12" height="56" fill="currentColor" />
          <rect x="130" y="180" width="12" height="56" fill="currentColor" />
          <path d="M45 174 Q101 164 157 174 L157 166 Q101 156 45 166 Z" fill="currentColor" />
          <rect x="52" y="184" width="98" height="6" fill="currentColor" />
          {/* Senso-ji 5-Story Buddhist Pagoda */}
          <polygon points="210,236 215,80 235,80 240,236" fill="currentColor" />
          {/* Flared Pagoda Roofs */}
          <path d="M190 200 Q225 186 260 200 Z" fill="currentColor" />
          <path d="M195 170 Q225 156 255 170 Z" fill="currentColor" />
          <path d="M200 140 Q225 126 250 140 Z" fill="currentColor" />
          <path d="M205 110 Q225 96 245 110 Z" fill="currentColor" />
          <path d="M210 80 Q225 66 240 80 Z" fill="currentColor" />
          {/* Pagoda Spire (Sorin) */}
          <line x1="225" y1="66" x2="225" y2="34" stroke="currentColor" strokeWidth="2.5" />

          {/* 2. TOKYO TOWER (Center, x=380 to x=640) */}
          {/* Lattice Eiffel-style legs */}
          <polygon points="410,236 490,90 530,90 610,236" fill="currentColor" />
          <path d="M450 236 Q510 180 570 236 Z" fill="currentColor" opacity="0.3" />
          {/* Main Observation Deck */}
          <rect x="475" y="140" width="70" height="20" rx="2" fill="currentColor" />
          {/* Top Deck */}
          <rect x="490" y="90" width="40" height="14" rx="2" fill="currentColor" />
          {/* Antenna Spire */}
          <line x1="510" y1="90" x2="510" y2="18" stroke="currentColor" strokeWidth="3" />

          {/* 3. TOKYO SKYTREE & SHINJUKU TOWERS (Right, x=680 to x=1160) */}
          {/* Modernist Shinjuku Tower */}
          <polygon points="700,236 700,90 740,60 780,90 780,236" fill="currentColor" />
          {/* Skytree Tower (Soaring Lattice Needle) */}
          <polygon points="840,236 874,38 886,38 920,236" fill="currentColor" />
          <rect x="860" y="120" width="40" height="16" rx="2" fill="currentColor" />
          <rect x="870" y="70" width="20" height="10" rx="1" fill="currentColor" />
          <line x1="880" y1="38" x2="880" y2="8" stroke="currentColor" strokeWidth="2.5" />
          {/* Mode Gakuen Cocoon High-Rise */}
          <path d="M960 236 C940 120 980 70 1020 70 C1060 70 1100 120 1080 236 Z" fill="currentColor" />
        </g>
      </svg>
    );
  }

  // 8. London: Big Ben (Elizabeth Tower) + Tower Bridge + London Eye + The Shard
  if (normalizedId.includes('london')) {
    return (
      <svg
        viewBox="0 0 1200 240"
        preserveAspectRatio="xMidYMax slice"
        className={`${className} transition-all duration-700 pointer-events-none select-none`}
        xmlns="http://www.w3.org/2000/svg"
        aria-label="London Big Ben and Tower Bridge architectural skyline silhouette"
      >
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.22' : '0.26'}>
          <rect x="80" y="140" width="80" height="100" fill="currentColor" />
          {/* St. Paul's Cathedral Dome in the distance */}
          <rect x="550" y="160" width="100" height="80" fill="currentColor" />
          <path d="M570 160 C570 110 630 110 630 160 Z" fill="currentColor" />
          <line x1="600" y1="110" x2="600" y2="86" stroke="currentColor" strokeWidth="2.5" />
          <rect x="1000" y="120" width="90" height="120" fill="currentColor" />
        </g>
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />

          {/* 1. ELIZABETH TOWER (BIG BEN) & WESTMINSTER (Left, x=40 to x=280) */}
          <rect x="60" y="160" width="140" height="76" fill="currentColor" />
          {/* Big Ben Clock Tower */}
          <rect x="120" y="90" width="46" height="146" fill="currentColor" />
          <rect x="116" y="58" width="54" height="32" fill="currentColor" />
          <circle cx="143" cy="74" r="9" fill="currentColor" opacity="0.3" />
          {/* Gothic Spire */}
          <polygon points="116,58 143,14 170,58" fill="currentColor" />
          <line x1="143" y1="14" x2="143" y2="2" stroke="currentColor" strokeWidth="2.5" />

          {/* 2. THE LONDON EYE (Center-Left, x=290 to x=540) */}
          <circle cx="410" cy="130" r="80" stroke="currentColor" strokeWidth="3" fill="none" />
          <circle cx="410" cy="130" r="12" fill="currentColor" />
          {/* Radiating A-Frame Support Legs */}
          <line x1="410" y1="130" x2="360" y2="236" stroke="currentColor" strokeWidth="4" />
          <line x1="410" y1="130" x2="460" y2="236" stroke="currentColor" strokeWidth="4" />
          {/* Wheel Spokes */}
          <line x1="410" y1="50" x2="410" y2="210" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
          <line x1="330" y1="130" x2="490" y2="130" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />

          {/* 3. TOWER BRIDGE (Center-Right, x=580 to x=940) */}
          {/* Left Gothic Tower */}
          <rect x="630" y="120" width="44" height="116" fill="currentColor" />
          <polygon points="626,120 652,66 678,120" fill="currentColor" />
          {/* Right Gothic Tower */}
          <rect x="790" y="120" width="44" height="116" fill="currentColor" />
          <polygon points="786,120 812,66 838,120" fill="currentColor" />
          {/* High-Level Walkways */}
          <rect x="674" y="94" width="116" height="8" fill="currentColor" />
          <rect x="674" y="112" width="116" height="6" fill="currentColor" />
          {/* Lower Bascule Roadway */}
          <rect x="580" y="200" width="300" height="10" fill="currentColor" />
          {/* Suspension Cables */}
          <path d="M580 200 Q630 140 652 120" stroke="currentColor" strokeWidth="3" fill="none" />
          <path d="M812 120 Q834 140 880 200" stroke="currentColor" strokeWidth="3" fill="none" />

          {/* 4. THE SHARD (Right, x=960 to x=1160) */}
          <polygon points="980,236 1040,24 1100,236" fill="currentColor" />
          <line x1="1040" y1="24" x2="1040" y2="8" stroke="currentColor" strokeWidth="2.5" />
        </g>
      </svg>
    );
  }

  // 9. Paris: Eiffel Tower + Arc de Triomphe + Sacré-Cœur + Notre-Dame
  if (normalizedId.includes('paris')) {
    return (
      <svg
        viewBox="0 0 1200 240"
        preserveAspectRatio="xMidYMax slice"
        className={`${className} transition-all duration-700 pointer-events-none select-none`}
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Paris Eiffel Tower and Arc de Triomphe architectural skyline silhouette"
      >
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.22' : '0.26'}>
          {/* Sacré-Cœur on Montmartre hill in background */}
          <path d="M80 236 Q180 160 280 236 Z" fill="currentColor" />
          <rect x="150" y="140" width="60" height="50" fill="currentColor" />
          <path d="M160 140 C160 104 200 104 200 140 Z" fill="currentColor" />
          <rect x="940" y="130" width="80" height="110" fill="currentColor" />
        </g>
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />

          {/* 1. ARC DE TRIOMPHE (Left, x=40 to x=280) */}
          <rect x="80" y="110" width="140" height="126" fill="currentColor" />
          <rect x="70" y="96" width="160" height="14" fill="currentColor" />
          {/* Monumental Roman Arch Opening */}
          <path d="M120 236 L120 160 C120 130 180 130 180 160 L180 236 Z" fill="currentColor" opacity="0.3" />

          {/* 2. EIFFEL TOWER (Center, x=360 to x=680) */}
          {/* Puddle-iron arched legs */}
          <polygon points="400,236 496,110 544,110 640,236" fill="currentColor" />
          <path d="M440 236 Q520 160 600 236 Z" fill="currentColor" opacity="0.3" />
          {/* Platform 1 */}
          <rect x="466" y="176" width="108" height="10" rx="1" fill="currentColor" />
          {/* Platform 2 */}
          <rect x="490" y="110" width="60" height="8" rx="1" fill="currentColor" />
          {/* Upper Spire Mast */}
          <polygon points="506,110 517,20 523,20 534,110" fill="currentColor" />
          {/* Apex Beacon Light */}
          <circle cx="520" cy="18" r="4" fill="currentColor" />
          <line x1="520" y1="14" x2="520" y2="2" stroke="currentColor" strokeWidth="2.5" />

          {/* 3. NOTRE-DAME CATHEDRAL (Right, x=740 to x=1160) */}
          <rect x="800" y="130" width="160" height="106" fill="currentColor" />
          {/* Twin Towers */}
          <rect x="800" y="80" width="46" height="50" fill="currentColor" />
          <rect x="914" y="80" width="46" height="50" fill="currentColor" />
          {/* Rose Window Cutout */}
          <circle cx="880" cy="135" r="16" fill="currentColor" opacity="0.3" />
          {/* Slender Central Gothic Flèche Spire */}
          <polygon points="876,130 880,38 884,130" fill="currentColor" />
          <line x1="880" y1="38" x2="880" y2="20" stroke="currentColor" strokeWidth="2" />
          {/* Louvre Pyramid */}
          <polygon points="1020,236 1070,165 1120,236" fill="currentColor" opacity="0.5" />
        </g>
      </svg>
    );
  }

  // 10. New York: Empire State Building + Statue of Liberty + Chrysler Building + Brooklyn Bridge
  if (normalizedId.includes('new york') || normalizedId.includes('nyc') || normalizedId.includes('manhattan')) {
    return (
      <svg
        viewBox="0 0 1200 240"
        preserveAspectRatio="xMidYMax slice"
        className={`${className} transition-all duration-700 pointer-events-none select-none`}
        xmlns="http://www.w3.org/2000/svg"
        aria-label="New York Empire State Building and Statue of Liberty architectural skyline silhouette"
      >
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.22' : '0.26'}>
          <rect x="60" y="110" width="80" height="130" fill="currentColor" />
          <rect x="180" y="80" width="90" height="160" fill="currentColor" />
          <rect x="980" y="100" width="90" height="140" fill="currentColor" />
        </g>
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />

          {/* 1. STATUE OF LIBERTY (Left, x=40 to x=240) */}
          {/* Fort Wood 11-Point Star Pedestal Base */}
          <rect x="70" y="210" width="80" height="26" fill="currentColor" />
          <rect x="85" y="170" width="50" height="40" fill="currentColor" />
          {/* Statue Robe & Figure */}
          <polygon points="92,170 100,105 120,105 128,170" fill="currentColor" />
          {/* 7-Point Radiate Crown & Head */}
          <circle cx="110" cy="98" r="8" fill="currentColor" />
          {/* Raised Arm & Torch */}
          <line x1="120" y1="105" x2="135" y2="70" stroke="currentColor" strokeWidth="4" />
          <polygon points="130,70 135,50 142,70" fill="currentColor" />

          {/* 2. EMPIRE STATE BUILDING (Center-Left, x=280 to x=520) */}
          <rect x="340" y="180" width="120" height="56" fill="currentColor" />
          <rect x="360" y="130" width="80" height="50" fill="currentColor" />
          <rect x="380" y="80" width="40" height="50" fill="currentColor" />
          {/* Mooring Mast & Spire */}
          <rect x="394" y="44" width="12" height="36" fill="currentColor" />
          <line x1="400" y1="44" x2="400" y2="10" stroke="currentColor" strokeWidth="3" />

          {/* 3. CHRYSLER BUILDING (Center-Right, x=560 to x=780) */}
          <rect x="620" y="160" width="80" height="76" fill="currentColor" />
          <rect x="635" y="110" width="50" height="50" fill="currentColor" />
          {/* Sunburst Terraced Art Deco Crown */}
          <path d="M635 110 C635 60 685 60 685 110 Z" fill="currentColor" />
          <line x1="660" y1="60" x2="660" y2="18" stroke="currentColor" strokeWidth="2.5" />

          {/* 4. ONE WORLD TRADE CENTER & BROOKLYN BRIDGE (Right, x=800 to x=1180) */}
          <polygon points="850,236 875,60 905,60 930,236" fill="currentColor" />
          <line x1="890" y1="60" x2="890" y2="12" stroke="currentColor" strokeWidth="3" />
          {/* Brooklyn Bridge Gothic Stone Tower */}
          <rect x="990" y="110" width="70" height="126" fill="currentColor" />
          <path d="M1005 236 L1005 150 C1005 125 1045 125 1045 150 L1045 236 Z" fill="currentColor" opacity="0.3" />
          <line x1="950" y1="180" x2="1140" y2="180" stroke="currentColor" strokeWidth="6" />
        </g>
      </svg>
    );
  }

  // 11. Dubai: Burj Khalifa + Burj Al Arab + Dubai Frame
  if (normalizedId.includes('dubai') || normalizedId.includes('uae') || normalizedId.includes('emirates')) {
    return (
      <svg
        viewBox="0 0 1200 240"
        preserveAspectRatio="xMidYMax slice"
        className={`${className} transition-all duration-700 pointer-events-none select-none`}
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Dubai Burj Khalifa and Burj Al Arab architectural skyline silhouette"
      >
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.22' : '0.26'}>
          <rect x="80" y="120" width="70" height="120" fill="currentColor" />
          <rect x="960" y="100" width="80" height="140" fill="currentColor" />
        </g>
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />

          {/* 1. DUBAI FRAME (Left, x=60 to x=260) */}
          <rect x="90" y="80" width="14" height="156" fill="currentColor" />
          <rect x="180" y="80" width="14" height="156" fill="currentColor" />
          <rect x="80" y="70" width="124" height="14" fill="currentColor" />
          <rect x="80" y="222" width="124" height="14" fill="currentColor" />

          {/* 2. BURJ KHALIFA (Center, x=420 to x=660) */}
          {/* Stepped Aerodynamic Y-Shaped Setbacks */}
          <polygon points="460,236 490,170 590,170 620,236" fill="currentColor" />
          <polygon points="480,170 510,110 570,110 600,170" fill="currentColor" />
          <polygon points="500,110 525,50 555,50 580,110" fill="currentColor" />
          {/* Telescopic Central Needle Spire */}
          <polygon points="530,50 538,10 542,10 550,50" fill="currentColor" />
          <line x1="540" y1="10" x2="540" y2="0" stroke="currentColor" strokeWidth="2.5" />

          {/* 3. BURJ AL ARAB (Right, x=740 to x=1020) */}
          {/* Billowing Sail Curved Profile on Artificial Island */}
          <path
            d="M800 236 L800 68 C800 68 880 78 880 170 C880 215 845 236 845 236 Z"
            fill="currentColor"
          />
          {/* Triangular Backing Spine Mast */}
          <polygon points="780,236 795,50 805,50 820,236" fill="currentColor" />
          {/* Cantilevered Helipad */}
          <line x1="800" y1="85" x2="845" y2="85" stroke="currentColor" strokeWidth="4" />
        </g>
      </svg>
    );
  }

  // 12. Sydney: Sydney Opera House Shell Sails + Sydney Harbour Bridge Arch
  if (normalizedId.includes('sydney')) {
    return (
      <svg
        viewBox="0 0 1200 240"
        preserveAspectRatio="xMidYMax slice"
        className={`${className} transition-all duration-700 pointer-events-none select-none`}
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Sydney Opera House and Harbour Bridge architectural skyline silhouette"
      >
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.22' : '0.26'}>
          <rect x="80" y="110" width="80" height="130" fill="currentColor" />
          <rect x="1000" y="90" width="90" height="150" fill="currentColor" />
        </g>
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />

          {/* 1. SYDNEY HARBOUR BRIDGE (Left, x=40 to x=540) */}
          {/* South Granite Pylon */}
          <rect x="70" y="130" width="36" height="106" fill="currentColor" />
          {/* North Granite Pylon */}
          <rect x="470" y="130" width="36" height="106" fill="currentColor" />
          {/* Giant Steel Parabolic Arch ("The Coathanger") */}
          <path d="M106 190 Q288 50 470 190" stroke="currentColor" strokeWidth="12" fill="none" />
          {/* Roadway Deck */}
          <rect x="50" y="186" width="480" height="10" fill="currentColor" />
          {/* Vertical Hanger Cables */}
          <line x1="180" y1="120" x2="180" y2="186" stroke="currentColor" strokeWidth="2" opacity="0.6" />
          <line x1="230" y1="95" x2="230" y2="186" stroke="currentColor" strokeWidth="2" opacity="0.6" />
          <line x1="288" y1="84" x2="288" y2="186" stroke="currentColor" strokeWidth="2" opacity="0.6" />
          <line x1="346" y1="95" x2="346" y2="186" stroke="currentColor" strokeWidth="2" opacity="0.6" />
          <line x1="396" y1="120" x2="396" y2="186" stroke="currentColor" strokeWidth="2" opacity="0.6" />

          {/* 2. SYDNEY OPERA HOUSE (Center-Right, x=600 to x=1080) */}
          {/* Bennelong Point Granite Plinth */}
          <rect x="620" y="218" width="440" height="18" fill="currentColor" />
          {/* Shell Sail 1 (Large Concert Hall Shell) */}
          <path d="M640 218 Q720 190 760 90 Q790 170 820 218 Z" fill="currentColor" />
          {/* Shell Sail 2 (Inner Nesting Shell) */}
          <path d="M690 218 Q760 190 790 120 Q820 180 840 218 Z" fill="currentColor" />
          {/* Shell Sail 3 (Joan Sutherland Theatre Shell) */}
          <path d="M830 218 Q890 190 920 105 Q950 170 980 218 Z" fill="currentColor" />
          {/* Shell Sail 4 (Restaurant Pavilion) */}
          <path d="M960 218 Q1000 195 1020 140 Q1040 185 1060 218 Z" fill="currentColor" />

          {/* Sydney Tower Eye (Far Right, x=1100 to x=1160) */}
          <polygon points="1120,236 1126,50 1134,50 1140,236" fill="currentColor" />
          <circle cx="1130" cy="80" r="12" fill="currentColor" />
          <line x1="1130" y1="50" x2="1130" y2="24" stroke="currentColor" strokeWidth="2.5" />
        </g>
      </svg>
    );
  }

  // 13. Cairo: Great Pyramids of Giza + Great Sphinx + Al-Azhar Citadel Minarets
  if (normalizedId.includes('cairo') || normalizedId.includes('giza') || normalizedId.includes('egypt')) {
    return (
      <svg
        viewBox="0 0 1200 240"
        preserveAspectRatio="xMidYMax slice"
        className={`${className} transition-all duration-700 pointer-events-none select-none`}
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Cairo Giza Pyramids and Citadel architectural skyline silhouette"
      >
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.22' : '0.26'}>
          <polygon points="80,236 240,110 400,236" fill="currentColor" />
          <rect x="940" y="130" width="80" height="110" fill="currentColor" />
        </g>
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />

          {/* 1. GREAT PYRAMIDS OF GIZA (Left & Center, x=40 to x=660) */}
          {/* Pyramid of Khufu (The Great Pyramid) */}
          <polygon points="60,236 280,52 500,236" fill="currentColor" />
          {/* Pyramid of Khafre with intact casing stone summit */}
          <polygon points="340,236 520,70 700,236" fill="currentColor" opacity="0.9" />
          {/* Pyramid of Menkaure (Smaller) */}
          <polygon points="20,236 100,150 180,236" fill="currentColor" opacity="0.7" />

          {/* 2. THE GREAT SPHINX (Center, x=680 to x=860) */}
          {/* Lion Body */}
          <path d="M700 236 L700 185 Q750 160 810 185 L840 236 Z" fill="currentColor" />
          {/* Human Royal Head with Nemes Headdress */}
          <rect x="740" y="145" width="30" height="40" rx="4" fill="currentColor" />
          <polygon points="730,155 755,120 780,155" fill="currentColor" />

          {/* 3. CITADEL & OTTOMAN MOSQUE MINARETS (Right, x=880 to x=1180) */}
          {/* Citadel Hill Base */}
          <rect x="880" y="180" width="280" height="56" fill="currentColor" />
          {/* Mosque Grand Central Dome */}
          <path d="M960 180 C960 110 1060 110 1060 180 Z" fill="currentColor" />
          {/* Slender Pencil Ottoman Minaret 1 */}
          <polygon points="940,180 945,34 955,34 960,180" fill="currentColor" />
          <polygon points="944,34 950,14 956,34" fill="currentColor" />
          {/* Slender Pencil Ottoman Minaret 2 */}
          <polygon points="1060,180 1065,34 1075,34 1080,180" fill="currentColor" />
          <polygon points="1064,34 1070,14 1076,34" fill="currentColor" />
        </g>
      </svg>
    );
  }

  // 14. Bangkok: Wat Arun Central Khmer Prang + Grand Palace Cascading Eaves & Chedis
  if (normalizedId.includes('bangkok') || normalizedId.includes('thailand')) {
    return (
      <svg
        viewBox="0 0 1200 240"
        preserveAspectRatio="xMidYMax slice"
        className={`${className} transition-all duration-700 pointer-events-none select-none`}
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Bangkok Wat Arun and Grand Palace architectural skyline silhouette"
      >
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.22' : '0.26'}>
          <rect x="80" y="130" width="70" height="110" fill="currentColor" />
          <rect x="960" y="110" width="80" height="130" fill="currentColor" />
        </g>
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />

          {/* 1. CHAO PHRAYA RIVER BOATS & LONG-TAILS (Left, x=40 to x=240) */}
          <path d="M60 232 Q110 216 160 232 Z" fill="currentColor" />
          <line x1="160" y1="228" x2="190" y2="210" stroke="currentColor" strokeWidth="3" />
          <rect x="90" y="210" width="40" height="14" rx="2" fill="currentColor" />

          {/* 2. WAT ARUN (TEMPLE OF DAWN) PRANG TOWER (Center, x=340 to x=720) */}
          {/* Stepped Terraced Khmer Base */}
          <rect x="380" y="224" width="300" height="12" fill="currentColor" />
          <rect x="410" y="210" width="240" height="14" fill="currentColor" />
          <rect x="440" y="196" width="180" height="14" fill="currentColor" />
          {/* Flanking Minor Prang 1 */}
          <polygon points="410,210 425,120 440,210" fill="currentColor" />
          <line x1="425" y1="120" x2="425" y2="102" stroke="currentColor" strokeWidth="2" />
          {/* Soaring Central Khmer-Style Prang Tower */}
          <path
            d="M480 196 C480 100 520 30 530 30 C540 30 580 100 580 196 Z"
            fill="currentColor"
          />
          {/* Seven-Forked Trident of Shiva (Trishula) at summit */}
          <line x1="530" y1="30" x2="530" y2="10" stroke="currentColor" strokeWidth="2.5" />
          {/* Flanking Minor Prang 2 */}
          <polygon points="620,210 635,120 650,210" fill="currentColor" />
          <line x1="635" y1="120" x2="635" y2="102" stroke="currentColor" strokeWidth="2" />

          {/* 3. GRAND PALACE & GOLDEN PHRA SIRATANA CHEDI (Right, x=760 to x=1160) */}
          <rect x="780" y="170" width="160" height="66" fill="currentColor" />
          {/* Cascading Thai Tiered Eaves with Cho Fah Gable Finials */}
          <polygon points="760,170 860,110 960,170" fill="currentColor" />
          <polygon points="790,140 860,86 930,140" fill="currentColor" />
          {/* Tall Golden Slender Bell-Shaped Chedi Stupa */}
          <path d="M1000 236 C990 160 1030 160 1020 70 L1030 70 C1020 160 1060 160 1050 236 Z" fill="currentColor" />
          <line x1="1025" y1="70" x2="1025" y2="24" stroke="currentColor" strokeWidth="2.5" />
        </g>
      </svg>
    );
  }

  // 15. Mumbai: Gateway of India + Taj Mahal Palace + Bandra-Worli Sea Link + Rajabai Tower
  if (normalizedId.includes('mumbai') || normalizedId.includes('bombay')) {
    return (
      <svg
        viewBox="0 0 1200 240"
        preserveAspectRatio="xMidYMax slice"
        className={`${className} transition-all duration-700 pointer-events-none select-none`}
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Mumbai coastal architectural skyline silhouette"
      >
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.25' : '0.3'}>
          <rect x="80" y="160" width="45" height="80" fill="currentColor" />
          <rect x="140" y="140" width="50" height="100" fill="currentColor" />
          <rect x="940" y="150" width="60" height="90" fill="currentColor" />
          <rect x="1020" y="130" width="75" height="110" fill="currentColor" />
        </g>
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />
          {/* BANDRA-WORLI SEA LINK */}
          <polygon points="170,236 182,54 192,54 204,236" fill="currentColor" />
          <line x1="187" y1="80" x2="70" y2="236" stroke="currentColor" strokeWidth="1.6" opacity="0.6" />
          <line x1="187" y1="100" x2="100" y2="236" stroke="currentColor" strokeWidth="1.6" opacity="0.6" />
          <line x1="187" y1="80" x2="300" y2="236" stroke="currentColor" strokeWidth="1.6" opacity="0.6" />
          <rect x="30" y="222" width="310" height="8" rx="2" fill="currentColor" />
          {/* GATEWAY OF INDIA */}
          <rect x="370" y="230" width="190" height="6" fill="currentColor" />
          <rect x="388" y="128" width="26" height="96" fill="currentColor" />
          <rect x="526" y="128" width="26" height="96" fill="currentColor" />
          <rect x="414" y="116" width="112" height="108" fill="currentColor" />
          <path d="M442 224 L442 160 C442 126 498 126 498 160 L498 224 Z" fill="currentColor" />
          <path d="M446 116 C446 80 494 80 494 116 Z" fill="currentColor" />
          {/* TAJ MAHAL PALACE */}
          <rect x="610" y="156" width="240" height="80" fill="currentColor" />
          <path d="M700 138 C694 100 730 68 730 68 C730 68 766 100 760 138 Z" fill="currentColor" />
          <line x1="730" y1="68" x2="730" y2="48" stroke="currentColor" strokeWidth="3" />
          {/* RAJABAI CLOCK TOWER */}
          <rect x="910" y="146" width="48" height="90" fill="currentColor" />
          <polygon points="914,96 934,28 954,96" fill="currentColor" />
        </g>
      </svg>
    );
  }

  // 16. Bengaluru: Vidhana Soudha + Bangalore Palace + High-Tech Spire
  if (normalizedId.includes('bengaluru') || normalizedId.includes('bangalore')) {
    return (
      <svg
        viewBox="0 0 1200 240"
        preserveAspectRatio="xMidYMax slice"
        className={`${className} transition-all duration-700 pointer-events-none select-none`}
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Bengaluru heritage and tech architectural skyline silhouette"
      >
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.24' : '0.28'}>
          <rect x="80" y="140" width="70" height="100" fill="currentColor" />
          <rect x="170" y="120" width="85" height="120" fill="currentColor" />
        </g>
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />
          {/* BANGALORE PALACE */}
          <rect x="50" y="140" width="36" height="96" fill="currentColor" />
          <polygon points="140,118 172,78 204,118" fill="currentColor" />
          {/* VIDHANA SOUDHA */}
          <rect x="380" y="152" width="380" height="66" fill="currentColor" />
          <polygon points="500,152 570,120 640,152" fill="currentColor" />
          <rect x="532" y="96" width="76" height="26" fill="currentColor" />
          <path d="M530 96 C530 46 610 46 610 96 Z" fill="currentColor" />
          {/* TECH SPIRES */}
          <polygon points="1030,236 1030,110 1065,70 1100,110 1100,236" fill="currentColor" />
        </g>
      </svg>
    );
  }

  // 17. Kolkata: Howrah Bridge + Victoria Memorial + St. Paul's Cathedral
  if (normalizedId.includes('kolkata') || normalizedId.includes('calcutta')) {
    return (
      <svg
        viewBox="0 0 1200 240"
        preserveAspectRatio="xMidYMax slice"
        className={`${className} transition-all duration-700 pointer-events-none select-none`}
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Kolkata heritage and Hooghly architectural skyline silhouette"
      >
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />
          {/* HOWRAH BRIDGE */}
          <polygon points="190,236 215,64 235,64 260,236" fill="currentColor" />
          <line x1="225" y1="74" x2="50" y2="216" stroke="currentColor" strokeWidth="3.5" />
          <line x1="225" y1="74" x2="380" y2="216" stroke="currentColor" strokeWidth="3.5" />
          <rect x="30" y="214" width="390" height="10" rx="2" fill="currentColor" />
          {/* VICTORIA MEMORIAL */}
          <rect x="510" y="162" width="320" height="62" fill="currentColor" />
          <polygon points="620,162 670,132 720,162" fill="currentColor" />
          <path d="M634 104 C634 48 706 48 706 104 Z" fill="currentColor" />
          <path d="M658 20 Q670 14 682 20 Q670 26 658 20 Z" fill="currentColor" />
        </g>
      </svg>
    );
  }

  // 18. Lucknow: Rumi Darwaza + Bara Imambara + Asfi Mosque
  if (normalizedId.includes('lucknow')) {
    return (
      <svg
        viewBox="0 0 1200 240"
        preserveAspectRatio="xMidYMax slice"
        className={`${className} transition-all duration-700 pointer-events-none select-none`}
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Lucknow Awadhi architectural skyline silhouette"
      >
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />
          {/* ASFI MOSQUE */}
          <rect x="60" y="90" width="26" height="146" fill="currentColor" />
          <path d="M166 160 C166 120 208 120 208 160 Z" fill="currentColor" />
          {/* RUMI DARWAZA */}
          <path d="M430 236 L430 156 C430 68 530 46 530 46 C530 46 630 68 630 156 L630 236 Z" fill="currentColor" />
          <rect x="516" y="46" width="28" height="14" fill="currentColor" />
          {/* BARA IMAMBARA & CLOCK TOWER */}
          <rect x="960" y="90" width="48" height="146" fill="currentColor" />
          <polygon points="966,46 984,12 1002,46" fill="currentColor" />
        </g>
      </svg>
    );
  }

  // 19. Hyderabad: Charminar + Hussain Sagar Buddha + Golconda Fort
  if (normalizedId.includes('hyderabad') || normalizedId.includes('secunderabad')) {
    return (
      <svg
        viewBox="0 0 1200 240"
        preserveAspectRatio="xMidYMax slice"
        className={`${className} transition-all duration-700 pointer-events-none select-none`}
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Hyderabad Charminar and Deccan architectural skyline silhouette"
      >
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />
          {/* BUDDHA STATUE */}
          <circle cx="170" cy="116" r="10" fill="currentColor" />
          {/* CHARMINAR */}
          <rect x="420" y="126" width="240" height="110" fill="currentColor" />
          <polygon points="380,236 394,48 408,48 420,236" fill="currentColor" />
          <polygon points="660,236 672,48 686,48 700,236" fill="currentColor" />
        </g>
      </svg>
    );
  }

  // 20. Ahmedabad: Sidi Saiyyed Mosque + Atal Bridge + Adalaj
  if (normalizedId.includes('ahmedabad') || normalizedId.includes('amdavad')) {
    return (
      <svg
        viewBox="0 0 1200 240"
        preserveAspectRatio="xMidYMax slice"
        className={`${className} transition-all duration-700 pointer-events-none select-none`}
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Ahmedabad heritage architectural skyline silhouette"
      >
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />
          {/* ATAL BRIDGE */}
          <path d="M70 236 Q210 120 350 236 Z" fill="currentColor" opacity="0.3" />
          {/* SIDI SAIYYED JAALI */}
          <rect x="410" y="120" width="280" height="116" fill="currentColor" />
          <path d="M430 236 L430 170 C430 130 520 130 520 170 L520 236 Z" fill="currentColor" opacity="0.3" />
        </g>
      </svg>
    );
  }

  // 21. Pune: Shaniwar Wada + Aga Khan Palace
  if (normalizedId.includes('pune') || normalizedId.includes('poona')) {
    return (
      <svg
        viewBox="0 0 1200 240"
        preserveAspectRatio="xMidYMax slice"
        className={`${className} transition-all duration-700 pointer-events-none select-none`}
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Pune Shaniwar Wada and Maratha architectural skyline silhouette"
      >
        {clouds}
        <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
          <rect x="0" y="234" width="1200" height="6" fill="currentColor" />
          {/* SHANIWAR WADA */}
          <path d="M410 236 L410 110 C410 88 470 88 470 110 L470 236 Z" fill="currentColor" />
          <path d="M610 236 L610 110 C610 88 670 88 670 110 L670 236 Z" fill="currentColor" />
        </g>
      </svg>
    );
  }

  // 22. Universal Indian / Global Metro Horizon (Dynamic Responsive Fallback)
  return (
    <svg
      viewBox="0 0 1200 240"
      preserveAspectRatio="xMidYMax slice"
      className={`${className} transition-all duration-700 pointer-events-none select-none`}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Universal metropolitan architectural skyline silhouette"
    >
      {clouds}
      <g style={{ color: fill }} opacity={isDark ? '0.24' : '0.28'}>
        <rect x="80" y="140" width="80" height="100" fill="currentColor" />
        <rect x="240" y="120" width="90" height="120" fill="currentColor" />
        <rect x="920" y="110" width="95" height="130" fill="currentColor" />
      </g>
      <g style={{ color: fill }} opacity={isDark ? '0.85' : '0.75'}>
        <rect x="0" y="234" width="1200" height="6" fill="currentColor" />
        {/* Heritage Monumental Dome */}
        <rect x="80" y="160" width="140" height="76" fill="currentColor" />
        <path d="M110 160 C110 108 190 108 190 160 Z" fill="currentColor" />
        <line x1="150" y1="108" x2="150" y2="84" stroke="currentColor" strokeWidth="3" />
        {/* Central Gateway Arch */}
        <rect x="300" y="124" width="160" height="112" fill="currentColor" />
        <path d="M344 236 L344 168 C344 136 416 136 416 168 L416 236 Z" fill="currentColor" />
        {/* Modernist Diagrid High-Rise */}
        <polygon points="530,236 530,90 600,45 670,90 670,236" fill="currentColor" />
        <line x1="600" y1="45" x2="600" y2="20" stroke="currentColor" strokeWidth="3.5" />
        {/* Cable Bridge & Spire Towers */}
        <polygon points="760,236 775,65 785,65 800,236" fill="currentColor" />
        <rect x="910" y="105" width="105" height="131" fill="currentColor" />
        <polygon points="1040,236 1040,80 1100,45 1160,80 1160,236" fill="currentColor" />
      </g>
    </svg>
  );
};

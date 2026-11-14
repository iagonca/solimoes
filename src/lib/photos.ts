// Fotos do Wikimedia Commons com licença livre. As licenças CC BY e CC BY-SA
// exigem crédito ao autor: ele fica na página /creditos, ligada no rodapé.
export const PHOTOS = {
  hero: "https://upload.wikimedia.org/wikipedia/commons/4/4e/Vista_%C3%A1erea_do_rio_Solim%C3%B5es%2C_no_estado_do_Amazonas_%288030651472%29.jpg",
  community: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5d/Casas_Ribeirinhas.jpg/1920px-Casas_Ribeirinhas.jpg",
  river: "https://upload.wikimedia.org/wikipedia/commons/f/f0/Vista_a%C3%A9rea_do_rio_Negro%2C_no_estado_do_Amazonas_%288030649220%29.jpg",
};

export const CREDITS = [
  { what: "Vista aérea do rio Solimões", who: "Tereza Sobreira / Ministério da Defesa", lic: "CC BY 2.0", licUrl: "https://creativecommons.org/licenses/by/2.0/",
    src: "https://commons.wikimedia.org/wiki/File:Vista_%C3%A1erea_do_rio_Solim%C3%B5es,_no_estado_do_Amazonas_(8030651472).jpg", img: PHOTOS.hero },
  { what: "Casas ribeirinhas no Amazonas", who: "Henrique Pina", lic: "CC BY 4.0", licUrl: "https://creativecommons.org/licenses/by/4.0/",
    src: "https://commons.wikimedia.org/wiki/File:Casas_Ribeirinhas.jpg", img: PHOTOS.community },
  { what: "Vista aérea do rio Negro", who: "Tereza Sobreira / Ministério da Defesa", lic: "CC BY 2.0", licUrl: "https://creativecommons.org/licenses/by/2.0/",
    src: "https://commons.wikimedia.org/wiki/File:Vista_a%C3%A9rea_do_rio_Negro,_no_estado_do_Amazonas_(8030649220).jpg", img: PHOTOS.river },
];

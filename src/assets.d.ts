/**
 * Bun mengubah import gambar jadi URL aset (dengan sidik isi saat build), tapi
 * bun-types tidak menyertakan deklarasinya, jadi ditulis di sini.
 */
declare module "*.png" {
	const url: string;
	export default url;
}

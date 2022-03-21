const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
module.exports = {
    output: {
        path: path.join(__dirname, '/dist'),
        filename: 'index.bundle.js',
    },
    plugins: [new HtmlWebpackPlugin({
        template: './src/template.html',
    }), new MiniCssExtractPlugin()],
    resolve: {
        extensions: ['.js', '.jsx']
    },
    module: {
        rules: [{
                test: /\.(js|jsx)$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader'
                }
            },
            {
                test: /\.scss$/,
                use: [MiniCssExtractPlugin.loader, 'css-loader', 'sass-loader'],
            },
        ]

    },


}
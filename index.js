var fs = require( 'fs' )
var path = require( 'path' )
var trumpet = require( 'trumpet' )
var concat = require( 'concat-stream' )

function EntryHtmlPlugin( tpl, options ) {
  if ( typeof tpl !== 'string' ) {
    options = tpl
    tpl = undefined
  }
  this.options = options || {}
  this.tpl = tpl || this.options.tpl
}
module.exports = EntryHtmlPlugin
EntryHtmlPlugin.prototype.apply = function( compiler ) {

  var options = this.options
  var context = compiler.options.context
  var htmlContext = options.context || context
  var entry = compiler.options.entry
  var tpl = this.tpl

  if ( !tpl ) {
    throw new TypeError( 'webpack-entry-html-plugin need tpl\'s path <String>' )
  }

  compiler.plugin( 'after-emit', function( compilation, callback ) {
    // get assets map
    var map = {}
    var stats = compilation.getStats().toJson()
    var chunks = stats.chunks
    var publicPath = stats.publicPath

    if ( typeof entry === 'string' || Array.isArray( entry ) ) {
      // single entry
      entry = { main: entry }
    }

    Object.keys( entry ).forEach( function( chunkname ) {
      var entries = [].concat( entry[ chunkname ] )
      var files = []
      var chunk = chunks.find( function( i ) {
        return i.names.indexOf( chunkname ) >= 0
      })
      files = chunk.files.reverse().concat( files )
      while( chunk.parents[0] != undefined ) {
        chunk = chunks[ chunk.parents[0] ]
        files = chunk.files.reverse().concat( files )
      }
      entries.forEach( function( entry ) {
        if ( !path.extname( entry ) ) {
          entry += '.js'
        }
        if ( entry.startsWith( '.' ) ) {
          map[ path.join( context, entry ) ] = files.map( function( file ) {
            return publicPath + ( publicPath.endsWith('/') ? '' : '/' ) + file
          })
        }
      })
    })

    var outputPath = options.outputPath || compilation.getPath( compiler.outputPath )
    var file = path.basename( tpl )
    var dir = options.dir || ''
    var dist = path.join( outputPath, dir, file )
    var fileSystem = options.fs || compiler.outputFileSystem

    if ( !fileSystem.mkdirp && fileSystem.mkdir ) {
      addMkdirp( fileSystem )
    }

    if ( !fileSystem.mkdirp ) {
      return callback( new Error( 'webpack-entry-html-plugin error: file system mkdirp error' ) )
    }

    fileSystem.mkdirp( path.dirname( dist ), function( err ) {
      if ( err ) {
        return callback( err )
      }

      var html = path.join( htmlContext, tpl )
      var htmlStr = fs.createReadStream( html )
      var tr = trumpet()
      var installed = {}

      tr.selectAll( 'script', function( el ) {
        var src = el.getAttribute( 'src' )
        if ( src && src.startsWith('.') ) {
          var srcPath = path.join( path.dirname( html ), src )
          if ( srcPath in map ) {
            var replaceStr = el.createWriteStream({ outer: true })
            replaceStr.write( '\n<!-- replace '+src+' start -->' )
            map[ srcPath ].forEach( function( p ) {
              if ( !installed[p] ) {
                if ( path.extname( p ) == '.css' ) {
                  replaceStr.write( '\n<link rel="stylesheet" type="text/css" href="'+p+'" />' )
                }
                else {
                  replaceStr.write( '\n<script src="'+p+'"></script>' )
                }
                installed[p] = true
              }
            })
            replaceStr.write( '\n<!-- replace '+src+' end -->\n' )
            replaceStr.end()
          }
        }
      })

      if ( fileSystem.createWriteStream ) {
        var distStr = fileSystem.createWriteStream( dist )
        distStr.on( 'finish', function() {
          callback( null )
        })
      }
      else {
        var distStr = concat( function( buffer ) {
          fileSystem.writeFile( dist, buffer, function( err ) {
            callback( err )
          })
        })
      }

      htmlStr.pipe( tr ).pipe( distStr )
    })

  })
}

function addMkdirp( fs ) {
  fs.mkdirp = function mk( path, callback ) {
    fs.access( path, ( err ) => {
      if ( !err ) {
        callback( null )
      }
      else {
        fs.mkdir( path, ( err ) => {
          if ( !err ) {
            callback( null )
          }
          else if ( err.code !== 'ENOENT' ) {
            callback( err )
          }
          else {
            mk( path.dirname( path ), ( err ) => {
              if ( !err ) {
                fs.mkdir( path, callback )
              }
              else {
                callback( err )
              }
            })
          }
        })
      }
    })
  }
}